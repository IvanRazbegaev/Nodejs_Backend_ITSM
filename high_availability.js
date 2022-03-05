import moment from "moment/moment.js";
import axios from "axios";
import {
    checkHaMonth,
    getPeriodEndDate,
    getPeriodStartDate, insertDowntimesIntoDB,
    selectIdInIncidents
} from "./helpers/helpers.js";

let periodStart, periodEnd;

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

const createDowntimeObj = (obj, avgRespTimeBuffer) => {

    if (obj.timestamp) {
        if (avgRespTimeBuffer !== undefined && avgRespTimeBuffer.length > 1) {
            return {
                dwntStart: obj.timestamp,
                dwntEnd: obj.timestamp,
                node: obj.node,
                highLimit: obj.highLimit,
                avgRespTime: avgRespTimeBuffer
            }
        } else
            return {
                dwntStart: obj.timestamp,
                dwntEnd: obj.timestamp,
                node: obj.node,
                highLimit: obj.highLimit,
                avgRespTime: obj.avgRespTime
            }
    } else {
        if (avgRespTimeBuffer !== undefined && avgRespTimeBuffer.length > 1) {
            return {
                dwntStart: obj.dwntStart,
                dwntEnd: obj.dwntEnd,
                node: obj.node,
                highLimit: obj.highLimit,
                avgRespTime: avgRespTimeBuffer
            }
        } else
            return {
                dwntStart: obj.dwntStart,
                dwntEnd: obj.dwntEnd,
                node: obj.node,
                highLimit: obj.highLimit,
                avgRespTime: obj.avgRespTime

            }
    }
}

const longDowntimeFilter = (array) => {
    if(array === undefined){
        return []
    }
    for (let i = 0; i < array.length;) {
        if (array[i + 1] === undefined) {
            array[i] = createDowntimeObj(array[i])
            i++;
            break;
        } else {
            let avgRespTimeBuffer = [];
            let timeDiff = 0;

            if (array[i].timestamp !== undefined) {
                timeDiff = array[i + 1].timestamp - array[i].timestamp
                avgRespTimeBuffer.push(array[i].avgRespTime);
            } else {
                timeDiff = array[i + 1].timestamp - array[i].dwntEnd;
                if (Array.isArray(array[i].avgRespTime)) {
                    avgRespTimeBuffer = array[i].avgRespTime
                } else {
                    avgRespTimeBuffer.push(array[i].avgRespTime);
                }
            }

            if (timeDiff <= 1 * 60) {
                avgRespTimeBuffer.push(array[i + 1].avgRespTime);
                if (array[i].dwntStart !== undefined) {
                    array[i] = {
                        dwntStart: array[i].dwntStart,
                        dwntEnd: array[i + 1].timestamp,
                        node: array[i].node,
                        highLimit: array[i].highLimit,
                        avgRespTime: avgRespTimeBuffer
                    }
                } else {
                    array[i] = {
                        dwntStart: array[i].timestamp,
                        dwntEnd: array[i + 1].timestamp,
                        node: array[i].node,
                        highLimit: array[i].highLimit,
                        avgRespTime: avgRespTimeBuffer
                    }
                }
                array.splice(i + 1, 1);
            } else {
                if (!Array.isArray(array[i].avgRespTime)) {
                    array[i] = createDowntimeObj(array[i])
                }
                i++;
            }
        }
    }

    return array;
}

const realDowntimeCalculation = (array) => {
    const result = [];
    for (let i = 0; i < array.length; i++) {
        if (typeof array[i].avgRespTime === "number") {
            const deltaResp = array[i].avgRespTime - array[i].highLimit;
            const dwntLength = (deltaResp / array[i].avgRespTime) * 2;
            result.push({
                dwntStart: array[i].dwntStart,
                dwntEnd: array[i].dwntStart,
                dwntLength: dwntLength.toFixed(3),
                highLimit: array[i].highLimit,
                node: array[i].node
            })
        } else {
            const deltaStart = array[i].avgRespTime[0] - array[i].highLimit;
            const deltaEnd = array[i].avgRespTime[array[i].avgRespTime.length - 1] - array[i].highLimit;
            const deltaRespTimeStart = deltaStart / array[i].avgRespTime[0];
            const deltaRespTimeEnd = deltaEnd / array[i].avgRespTime[array[i].avgRespTime.length - 1];
            const dwntLength = deltaRespTimeStart + deltaRespTimeEnd + ((array[i].dwntEnd - array[i].dwntStart) / (1 * 60 * 1000))

            result.push({
                dwntStart: array[i].dwntStart,
                dwntEnd: array[i].dwntStart,
                dwntLength: dwntLength.toFixed(3),
                highLimit: array[i].highLimit,
                node: array[i].node
            })
        }
    }
    return result;
}

const getDowntimes = async (periodStart, periodEnd, highLimit) => {

    const influxAvgTimeDbs = [
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
                return item.map(timeFraction => {
                    return {
                        timestamp: timeFraction.timestamp,
                        avgRespTime: timeFraction.avgRespTime,
                        node: timeFraction.node,
                        highLimit
                    }
                })
                    .filter(timeFraction => checkForDowntime(timeFraction))
            })
            .filter(item => {
                if (item.length !== 0) {
                    return item;
                }
            })[0]
    }

    const firstNodeDowntimes = longDowntimeFilter(await downtimeFilter(await createTempPromArray(periodStart, periodEnd, influxAvgTimeDbs[0])))

    const secondNodeDowntimes = longDowntimeFilter(await downtimeFilter(await createTempPromArray(periodStart, periodEnd, influxAvgTimeDbs[1])))

    const thirdNodeDowntimes = longDowntimeFilter(await downtimeFilter(await createTempPromArray(periodStart, periodEnd, influxAvgTimeDbs[2])))

    const haCalculationFirstNode = realDowntimeCalculation(firstNodeDowntimes);
    const haCalculationSecondNode = realDowntimeCalculation(secondNodeDowntimes);
    const haCalculationThirdNode = realDowntimeCalculation(thirdNodeDowntimes);

    return {haCalculationFirstNode, haCalculationSecondNode, haCalculationThirdNode}
}

const incidentRefSearch = async (data) => {

    const from = data.dwntStart * 1000;
    const to = data.dwntEnd * 1000;

    const incidentId = await selectIdInIncidents(from, to)

    return incidentId;
}


export const haMain = async (month, year, highLimit) => {

    if (month > 12) {
        return new Error("Вообще-то в году 12 месяцев...")
    }

    periodStart = getPeriodStartDate(month, year);
    periodEnd = getPeriodEndDate(month, year);

    const checkIfDataExists = await checkHaMonth(month, year, highLimit)
    if (checkIfDataExists.length !== 0) {
        return checkIfDataExists;
    }

    const downtimes = await getDowntimes(periodStart, periodEnd, highLimit);

    for (const data of downtimes.haCalculationFirstNode) {
        const incidentId = await incidentRefSearch(data);
        await insertDowntimesIntoDB(data, incidentId);
    }
    for (const data of downtimes.haCalculationSecondNode) {
        const incidentId = await incidentRefSearch(data);
        await insertDowntimesIntoDB(data, incidentId);
    }
    for (const data of downtimes.haCalculationThirdNode) {
        const incidentId = await incidentRefSearch(data);
        await insertDowntimesIntoDB(data, incidentId);
    }
}