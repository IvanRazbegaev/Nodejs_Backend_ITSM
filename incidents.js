import {insertDate, insertIncidentsIntoDB, lastCheckTimestamp} from "./helpers/helpers.js";
import axios from "axios";

const higherIncidentThreshold = 0.15;
const lowerIncidentThreshold = 0.03

let dateTo = Date.now()
let dateFrom = await lastCheckTimestamp();

/*
*@params number
*@returns string
 */
const convertToJsonDate = (timestamp) => {
    return new Date(timestamp).toJSON()
}

/*
*@params Date
*@returns number
 */

const convertToTimestamp = (date) => {
    if (isNaN(Date.parse(date))) {
        return date
    } else return Date.parse(date)
}

/*
*@params Date/number, Date/number, string, number
*@returns Obj{number, number, string, number}
 */

const createIncidentObject = (incidentStart, incidentEnd, host, nettoTime) => {
    return {
        incidentStart: convertToTimestamp(incidentStart),
        incidentEnd: convertToTimestamp(incidentEnd),
        host: host,
        nettoTime: nettoTime,
    }
}

/*
*@params Array
*@returns Array
 */

const checkForLongIncidents = (array) => {

    const checkItemTimeFormat = (item) => {
        if (item.incidentTime !== undefined) {
            return createIncidentObject(item.incidentTime, item.incidentTime, item.host, item.nettoTime)
        } else {
            return createIncidentObject(item.incidentStart, item.incidentEnd, item.host, item.nettoTime)
        }
    }

    for (let i = 0; i < array.length;) {

        if (array[i + 1] === undefined) {
            array[i] = checkItemTimeFormat(array[i]);
            i++;
            break;
        } else {
            if (array[i].host === array[i + 1].host) {
                const timeDiff = convertToTimestamp(array[i].incidentTime) - convertToTimestamp(array[i + 1].incidentTime);
                if (timeDiff <= 2 * 60 * 1000 && timeDiff >= -2 * 60 * 1000) {
                    let maxNetto = Math.max(array[i].nettoTime, array[i + 1].nettoTime);
                    array[i] = checkItemTimeFormat(array[i]);
                    array.splice(i + 1, 1);
                } else {
                    array[i] = checkItemTimeFormat(array[i]);
                    i++;
                }
            } else {
                array[i] = checkItemTimeFormat(array[i]);
                i++;
            }
        }
    }
    return array;
}

/*
*@params Array
*@returns Array
 */

const checkForGlobalIncidents = (array) => {

    const sortedArray = array.sort((firstItem, secondItem) => {
        if (firstItem.incidentStart < secondItem.incidentStart) {
            if (firstItem.incidentEnd < secondItem.incidentEnd) {
                return -1
            } else return 0
        } else if (firstItem.incidentStart > secondItem.incidentStart) {
            if (firstItem.incidentEnd > secondItem.incidentEnd) {
                return 1
            } else return 0
        }
    })

    for (let i = 0; i < sortedArray.length;) {

        if (sortedArray[i + 1] === undefined) {
            sortedArray[i] = createIncidentObject(sortedArray[i].incidentStart, sortedArray[i].incidentEnd, sortedArray[i].host, sortedArray[i].nettoTime)
            break
        } else {
            if (sortedArray[i].host !== sortedArray[i + 1].host) {
                const incidentStartDiff = sortedArray[i].incidentStart - sortedArray[i + 1].incidentStart;
                const incidentEndDiff = sortedArray[i].incidentEnd - sortedArray[i + 1].incidentEnd;
                if (incidentStartDiff === 0 && incidentEndDiff === 0) {
                    let maxNetto = Math.max(sortedArray[i].nettoTime, sortedArray[i + 1].nettoTime);
                    sortedArray[i] = createIncidentObject(sortedArray[i].incidentStart, sortedArray[i].incidentEnd, `${sortedArray[i].host},${sortedArray[ i+1 ].host}`, maxNetto);
                    sortedArray.splice(i + 1, 1);
                } else {
                    sortedArray[i] = createIncidentObject(sortedArray[i].incidentStart, sortedArray[i].incidentEnd, sortedArray[i].host, sortedArray[i].nettoTime)
                    i++;
                }
            } else {
                sortedArray[i] = createIncidentObject(sortedArray[i].incidentStart, sortedArray[i].incidentEnd, sortedArray[i].host, sortedArray[i].nettoTime)
                i++;
            }
        }
    }
    return sortedArray;
}

/*
* @returns Array
 */

const getDataFromInflux = async () => {
    const url = "https://influxapi.egamings.com/query?q=";
    let query = '';
    const queryData = {
        nodeHost: ['site2-deac-loggingdb1-4', 'site2-deac-loggingdb2-4', 'site1-telia-loggingdb3-4'],
        nodeReqTimeField: ['mr_req_time_in_system', 'mr_req_time_in_system2', 'mr_req_time_in_system3']
    }

    for (let i = 0; i < queryData.nodeReqTimeField.length; i++) {
        const influxQuery = `SELECT host, last(${queryData.nodeReqTimeField[i]}) FROM "telegraf". "autogen"."grafana_mr_requests" WHERE host='${queryData.nodeHost[i]}' AND  time >= '${convertToJsonDate(dateFrom)}' AND time < '${convertToJsonDate(dateTo)}' GROUP BY (time(60s))`;

        query += `${influxQuery}%3B`;
    }
    const result = await axios
        .get(url + query)
        .then(response => response.data.results)
        .catch(err => console.log(err))

    return result;

}

/*
* @returns Array
 */

const getIncidentsFromArray = async () => {

    const resultArray = await getDataFromInflux();
    let incidents = [];


    for (const result of resultArray) {
        if (result.series === undefined || result.series.length === 0){
            return incidents
        }
        for (let i = 0; i < result.series[0].values.length; i++) {
            const incidentTime = result.series[0].values[i][0];
            const host = result.series[0].values[i][1];
            const nettoTime = result.series[0].values[i][2];
            if ((nettoTime > higherIncidentThreshold || nettoTime < lowerIncidentThreshold) && nettoTime != null) {
                incidents.push({
                    incidentTime,
                    host,
                    nettoTime
                })
            }
        }
    }
    incidents = checkForLongIncidents(incidents)
    console.log(incidents)
    incidents = checkForGlobalIncidents(incidents)

    return incidents;
}

/*
* @returns string
 */

export const main = async () => {
    let result;
    let dateInsertResult;

    dateTo = Date.now()
    dateFrom = await lastCheckTimestamp();

    const incidents = await getIncidentsFromArray()
    dateInsertResult = await insertDate(dateTo);
    if(incidents.length !== 0){
        for (const incident of incidents) {
            result = await insertIncidentsIntoDB(incident);
        }
        return result;
    } else {
        return ("No incidents to insert")
    }
}

