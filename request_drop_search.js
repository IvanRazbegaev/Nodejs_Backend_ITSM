//TODO: 1. Функция первой производной из расчета Юры в Google App;
//      2. minValue меняем на restoreValue, фиксируем его при начале инцидента (Math.abs(dF)>0.1 - вот тут);
//      3. При достижении restoreValue - фиксируем конце инцидента;
//      4. Считаем даунтайм в этих точках;

import axios from "axios";
import moment from "moment/moment.js";
import {
    checkHaMonth,
    checkReqDropInHa,
    getPeriodEndDate,
    getPeriodStartDate,
    insertReqDropsIntoDB
} from "./helpers/helpers.js";

let periodStart, periodEnd;

const getInfluxData = async (periodStart, periodEnd, node) => {
    const promUrl = 'https://prom-telia.egamings.com/api/v1/query_range?query=';

    const result = [];
    let promQuery = `sum_over_time(funcore_requests_count_host_doc_count{${node}}[4m:1m])&start=${periodStart}&end=${periodEnd}&step=1m`

    // Сия ебанина присутствует тут по причинам того, что Prometheus все-таки набор костылей и в API хочет получать "+" в случае сложения метрик с которым URL в свою очередь естественно не работает. Энкодим все символы, блеать

    if (node === 'apiprod.fundist.org') {
        promQuery = `sum(sum_over_time(funcore_requests_count_host_doc_count%7Bhost%3D"api.fundist.org"%7D%5B4m%3A1m%5D))%20%2B%20sum(sum_over_time(funcore_requests_count_host_doc_count%7Bhost%3D"apiprod.fundist.org"%7D%5B4m%3A1m%5D))%20%2B%20sum(sum_over_time(funcore_requests_count_host_doc_count%7Bhost%3D"capi-pinup.fundist.org"%7D%5B4m%3A1m%5D))&start=${periodStart}&end=${periodEnd}&step=1m`;
    }

    const vmData = await axios
        .get(promUrl + promQuery)
        .then(result => result.data.data.result[0])
        .catch(err => console.log(err))

    if (vmData) {
        for (let i = 0; i < vmData.values.length; i++) {
            if (vmData.metric.host === undefined) {
                result.push({
                    timestamp: vmData.values[i][0],
                    reqCount: Number(vmData.values[i][1]),
                    node: 'apiprod.fundist.org'
                })
            } else {
                result.push({
                    timestamp: vmData.values[i][0],
                    reqCount: Number(vmData.values[i][1]),
                    node: vmData.metric.host
                })
            }
        }
    }
    return result;
}

const createDateOfTheMouthArray = (monthStart, monthEnd) => {
    const dates = [];

    const startDate = moment(monthStart);
    const endDate = moment(monthEnd);

    while (startDate.diff(endDate) <= 0) {
        dates.push(startDate.clone().utc().format());
        startDate.add(1, 'days');
    }

    return dates;
}

const createTempPromArray = async (periodStart, periodEnd, node) => {
    let result = [];
    const datesArray = createDateOfTheMouthArray(periodStart, periodEnd);

    for (let i = 0; i < datesArray.length - 1; i++) {
        const tempResult = await getInfluxData(datesArray[i], datesArray[i + 1], node);
        if (tempResult.length !== 0) {
            result[i] = tempResult;
        }
    }
    return result
}


const requestDropCalculation = async (array, derivativeLevel) => {

    const result = [];

    let reqDropFlag = false;
    let restoreStartFlag = false;
    let restoreValue = 0;
    let reqDropStart, reqDropEnd

    for (const day of array) {
        for (let i = 1; i < day.length - 1; i++) {

            const deltaReq = (day[i + 1].reqCount - day[i - 1].reqCount);
            const deltaTimeMinutes = (day[i + 1].timestamp - day[i - 1].timestamp) / 60;

            const derivative = deltaReq / deltaTimeMinutes;

            if (derivative < derivativeLevel && !reqDropFlag) {
                reqDropStart = day[i].timestamp
                restoreValue = day[i].reqCount
                reqDropFlag = true;
                continue;
            }
            // Если приращение больше 0 - восстанавливаемся, количество запросов растет
            if (derivative > 0 && reqDropFlag) {
                restoreStartFlag = true;
                if(day[i].reqCount >= restoreValue){
                    reqDropEnd = day[i].timestamp
                    restoreValue = 0;
                    reqDropFlag = false;
                    result.push({
                        reqDropStart,
                        reqDropEnd,
                        reqDropLenght: (reqDropEnd - reqDropStart) / 60,
                        host: day[i].node
                    })
                }
            }

            //Эта часть отвечает за определение восстановились ли мы в случае, если в начале инцидента была тенденция к уменьшению запросов (aka ночное время)
            if(derivative > -200 && reqDropFlag && restoreStartFlag && derivative < 0 && day[i].reqCount >= restoreValue * 0.7){
                reqDropEnd = day[i].timestamp
                restoreValue = 0;
                reqDropFlag = false;
                restoreStartFlag = false;
                result.push({
                    reqDropStart,
                    reqDropEnd,
                    reqDropLenght: (reqDropEnd - reqDropStart) / 60,
                    host: day[i].node
                })
            }
        }

    }
    return result;
}

const emptyDataFilter = (array) => {
    return array.filter(item => {
        if (item) {
            return item;
        }
    })
}

export const reqDropMain = async (month, year) => {

    if (month > 12) {
        return new Error("Вообще-то в году 12 месяцев...")
    }

    periodStart = getPeriodStartDate(month, year);
    periodEnd = getPeriodEndDate(month, year);

    const influxAvgTimeDbs = [
        'apiprod.fundist.org',
        'host="apiprod2.fundist.org"',
        'host="apiprod3.fundist.org"'
    ];

    const checkIfDataExists = await checkHaMonth(month, year)
    if (checkIfDataExists.length !== 0) {
        return checkIfDataExists;
    }

    const haFirstNodeRequestDropCalculation = await emptyDataFilter(await createTempPromArray(periodStart, periodEnd, influxAvgTimeDbs[0]));
    const haSecondNodeRequestDropCalculation = await emptyDataFilter(await createTempPromArray(periodStart, periodEnd, influxAvgTimeDbs[1]));
    const haThirdNodeRequestDropCalculation = await emptyDataFilter(await createTempPromArray(periodStart, periodEnd, influxAvgTimeDbs[2]));

    // Данные для отклонения подобраны имперически. В случае изменения нагрузки на ноду надо будет изменить и отклонение
    const haFirst = await requestDropCalculation(haFirstNodeRequestDropCalculation, -20000);
    const haSecond = await requestDropCalculation(haSecondNodeRequestDropCalculation, -5000);
    const haThird = await requestDropCalculation(haThirdNodeRequestDropCalculation, -4000);

    for (let i = 0; i < haFirst.length; i++) {
        await insertReqDropsIntoDB(haFirst[i]);
    }

    for (let i = 0; i < haSecond.length; i++) {
        await insertReqDropsIntoDB(haSecond[i]);
    }

    for (let i = 0; i < haThird.length; i++) {
        await insertReqDropsIntoDB(haThird[i]);
    }
}
