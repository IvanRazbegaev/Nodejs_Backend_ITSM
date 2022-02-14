import moment from "moment/moment.js";
import axios from "axios";
import {checkHaMonth, insertDowntimesIntoDB} from "./helpers/helpers.js";

let periodStart, periodEnd;


// Используем библиотеку momentjs для получения даты начала и конца поисков в инфлюксе. Длинно да, но Date в ноде делает фигню вместо того, что должен делать - формат new Date (year, month, 1) выдает фигню вместо даты начала месяца
const getPeriodStartDate = (month, year) => {
    return moment().year(year).month(month - 1).date(1).hour(0).minute(0).second(0).utc().format()
}

const getPeriodEndDate = (month, year) => {
    return moment().year(year).month(month).date(1).hour(0).minute(0).second(0).utc().format()
}

const getInfluxData = async (periodStart, periodEnd, node) => {
    const promUrl = 'https://prom-telia.egamings.com/api/v1/query_range?query=';

    const result = [];
    const promQuery = `funcore_time_duration_average_host_time_value{${node}}&start=${periodStart}&end=${periodEnd}&step=1m`

    const vmData = await axios
        .get(promUrl + promQuery)
        .then(result => result.data.data.result[0])
        .catch(err => console.log(err))

    if (vmData) {
        for (let i = 0; i < vmData.values.length; i++) {
            result.push({
                timestamp: vmData.values[i][0],
                avgRespTime: Number(vmData.values[i][1]),
                node: vmData.metric.host
            })
        }
    }
    return result;
}

//Две функции ниже существуют из-за мерзкого ограничения на получение ответа на запрос в 11000 точек в Prometheus
// Эта функция для создания массива дат для последующей итерации по нему.

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
// А это функция проходится по массиву дат и результат складывает в массив
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

const createDowntimeObj = (obj) => {

    if (obj.timestamp) {
        return {
            dwntStart: obj.timestamp,
            dwntEnd: obj.timestamp,
            node: obj.node,
            highLimit: obj.highLimit
        }
    } else {
        return {
            dwntStart: obj.dwntStart,
            dwntEnd: obj.dwntEnd,
            node: obj.node,
            highLimit: obj.highLimit
        }
    }
}

const longDowntimeFilter = (array) => {
    for (let i = 0; i < array.length;) {
        if (array[i + 1] === undefined) {
            array[i] = createDowntimeObj(array[i])
            i++;
            break;
        } else {
            let timeDiff = 0;
            if (array[i].timestamp) {
                timeDiff = array[i + 1].timestamp - array[i].timestamp
            } else {
                timeDiff = array[i + 1].timestamp - array[i].dwntEnd
            }
            if (timeDiff <= 1 * 60 * 1000) {
                array[i] = createDowntimeObj(array[i])
                array.splice(i + 1, 1);
            } else {
                array[i] = createDowntimeObj(array[i])
                i++;
            }
        }
    }
    return array;
}

const getDowntimes = async (periodStart, periodEnd, highLimit) => {

    const influxAvgTimeDbs = [
        'host!="api.fundist.org"',
        'host=~"apiprod.fundist.org"',
        'host="apiprod2.fundist.org"',
        'host="apiprod3.fundist.org"'
    ];
    const downtimeAvgTimeConditions = {
        lowerLimit: 0.1,
        highLimit
    };

    const checkForDowntime = (item) => {
        return item.avgRespTime > downtimeAvgTimeConditions.highLimit || item.avgRespTime < downtimeAvgTimeConditions.lowerLimit;

    }

    const downtimeFilter = (array) => {
        return array.filter(item => {
            if (item) {
                return item;
            }
        })
            .map(item => {
                for (let i = 0; i < item.length; i++) {
                    return {
                        timestamp: item[i].timestamp,
                        avgRespTime: item[i].avgRespTime,
                        node: item[i].node,
                        highLimit
                    };
                }
            }).filter(item => {
                if (checkForDowntime(item)) {
                    return item
                }
            })
    }

    const firstNodeDowntimes = longDowntimeFilter(await downtimeFilter(await createTempPromArray(periodStart, periodEnd, influxAvgTimeDbs[1])))

    const secondNodeDowntimes = longDowntimeFilter(await downtimeFilter(await createTempPromArray(periodStart, periodEnd, influxAvgTimeDbs[2])))

    const thirdNodeDowntimes = longDowntimeFilter(await downtimeFilter(await createTempPromArray(periodStart, periodEnd, influxAvgTimeDbs[3])))

    const allNodesDowntimes = longDowntimeFilter(await downtimeFilter(await createTempPromArray(periodStart, periodEnd, influxAvgTimeDbs[0])))

    return {firstNodeDowntimes, secondNodeDowntimes, thirdNodeDowntimes, allNodesDowntimes}
}

export const haMain = async (month, year, highLimit) => {

    periodStart = getPeriodStartDate(month, year);
    periodEnd = getPeriodEndDate(month, year);

    const checkIfDataExists = await checkHaMonth(periodStart, periodEnd, highLimit)
    if (checkIfDataExists.length !== 0)
        throw new Error("Данные за введенный Вами месяц уже есть в БД")

    if (month > 12)
        throw new Error("Вообще-то в году 12 месяцев...")

    const downtimes = await getDowntimes(periodStart, periodEnd, highLimit);


    for (const data of downtimes.allNodesDowntimes) {
        await insertDowntimesIntoDB(data);
    }
    for (const data of downtimes.firstNodeDowntimes) {
        await insertDowntimesIntoDB(data);
    }
    for (const data of downtimes.secondNodeDowntimes) {
        await insertDowntimesIntoDB(data);
    }
    for (const data of downtimes.thirdNodeDowntimes) {
        await insertDowntimesIntoDB(data);
    }

}

await haMain(2, 2022, 0.15);