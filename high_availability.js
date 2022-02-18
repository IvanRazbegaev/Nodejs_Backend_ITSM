import moment from "moment/moment.js";
import axios from "axios";
import {checkHaMonth, getPeriodEndDate, getPeriodStartDate, insertDowntimesIntoDB} from "./helpers/helpers.js";

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
        if (avgRespTimeBuffer !==undefined && avgRespTimeBuffer.length > 1) {
            return {
                dwntStart: obj.timestamp,
                dwntEnd: obj.timestamp,
                node: obj.node,
                highLimit: obj.highLimit,
                respTime: avgRespTimeBuffer
            }
        } else
        return {
            dwntStart: obj.timestamp,
            dwntEnd: obj.timestamp,
            node: obj.node,
            highLimit: obj.highLimit,
            respTime: obj.avgRespTime
        }
    } else {
        if (avgRespTimeBuffer !==undefined && avgRespTimeBuffer.length > 1) {
            return {
                dwntStart: obj.dwntStart,
                dwntEnd: obj.dwntEnd,
                node: obj.node,
                highLimit: obj.highLimit,
                respTime: avgRespTimeBuffer
            }
        } else
            return {
            dwntStart: obj.dwntStart,
            dwntEnd: obj.dwntEnd,
            node: obj.node,
            highLimit: obj.highLimit,
            respTime: obj.respTime

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
            const avgRespTimeBuffer = [];
            let timeDiff = 0;
            if (array[i].timestamp) {
                timeDiff = array[i + 1].timestamp - array[i].timestamp
                avgRespTimeBuffer.push(array[i].avgRespTime);
            } else {
                timeDiff = array[i + 1].timestamp - array[i].dwntEnd
            }
            if (timeDiff <= 1 * 60 * 1000) {
                avgRespTimeBuffer.push(array[i].avgRespTime);
                array[i] = createDowntimeObj(array[i], avgRespTimeBuffer)
                array.splice(i + 1, 1);
            } else {
                array[i] = createDowntimeObj(array[i])
                i++;
            }
        }
    }
    return array;
}

const calculateAvailability = (array) => {
    const result = [];
    for (let i = 0; i < array.length; i++) {
        if ( typeof array[i].respTime === "number" ) {
            const deltaResp = array[i].respTime - array[i].highLimit;
            const dwntLength = (deltaResp / array[i].respTime) * 2;
            result.push({
                dwntStart: array[i].dwntStart,
                dwntEnd: array[i].dwntStart,
                dwntLength: dwntLength.toFixed(3),
                highLimit: array[i].highLimit,
                node: array[i].node
            })
        } else {
            const deltaStart = array[i].respTime[0] - array[i].highLimit;
            const deltaEnd = array[i].respTime[array[i].respTime.length - 1] - array[i].highLimit;
            const deltaRespTimeStart = deltaStart / array[i].respTime[0];
            const deltaRespTimeEnd = deltaEnd / array[i].respTime[array[i].respTime.length - 1];
            const dwntLength = deltaRespTimeStart + deltaRespTimeEnd + ((array[i].dwntEnd - array[i].dwntStart)/(1 * 60 * 1000))

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

    const haCalculationFirstNode = calculateAvailability(firstNodeDowntimes);
    const haCalculationSecondNode = calculateAvailability(secondNodeDowntimes);
    const haCalculationThirdNode = calculateAvailability(thirdNodeDowntimes);
    const haCalculationAllNodes = calculateAvailability(allNodesDowntimes);

    return {haCalculationFirstNode, haCalculationSecondNode, haCalculationThirdNode, haCalculationAllNodes}
}


export const haMain = async (month, year, highLimit) => {

    periodStart = getPeriodStartDate(month, year);
    periodEnd = getPeriodEndDate(month, year);

    const checkIfDataExists = await checkHaMonth(month, year, highLimit)
    if (checkIfDataExists.length !== 0) {
        return checkIfDataExists;
    }

    if (month > 12) {
        return new Error("Вообще-то в году 12 месяцев...")
    }

    const downtimes = await getDowntimes(periodStart, periodEnd, highLimit);
    console.log(downtimes)
    for (const data of downtimes.haCalculationFirstNode) {
        await insertDowntimesIntoDB(data);
    }
    for (const data of downtimes.haCalculationSecondNode) {
        await insertDowntimesIntoDB(data);
    }
    for (const data of downtimes.haCalculationThirdNode) {
        await insertDowntimesIntoDB(data);
    }
    for (const data of downtimes.haCalculationAllNodes) {
        await insertDowntimesIntoDB(data);
    }
    return downtimes;
}