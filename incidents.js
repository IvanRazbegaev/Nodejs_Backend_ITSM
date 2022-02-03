import {insertDate, insertIncidentsIntoDB, lastCheckTimestamp} from "./helpers/helpers.js";
import axios from "axios";

const higherIncidentThreshold = 0.15;
const lowerIncidentThreshold = 0.03

const dateTo = Date.now()
const dateFrom = await lastCheckTimestamp();

const convertToJsonDate = (timestamp) => {
    return new Date(timestamp).toJSON()
}

const convertToTimestamp = (date) => {
    if (isNaN(Date.parse(date))) {
        return date
    } else return Date.parse(date)
}

const createIncidentObject = (incidentStart, incidentEnd, host, nettoTime) => {
    return {
        incidentStart: convertToTimestamp(incidentStart),
        incidentEnd: convertToTimestamp(incidentEnd),
        host: host,
        nettoTime: nettoTime,
    }
}

const checkForLongIncidents = (array) => {
    for (let i = 0; i < array.length;) {

        if (array[i + 1] === undefined) {
            array[i] = createIncidentObject(array[i].incidentTime, array[i].incidentTime, array[i].host, array[i].nettoTime)
            break
        } else {
            if (array[i].host === array[i + 1].host) {
                const timeDiff = convertToTimestamp(array[i].incidentTime) - convertToTimestamp(array[i + 1].incidentTime);
                if (timeDiff <= 1 * 60 * 1000 && timeDiff >= -1 * 60 * 1000) {
                    let maxNetto = Math.max(array[i].nettoTime, array[i + 1].nettoTime);
                    array[i] = createIncidentObject(array[i].incidentTime, array[i + 1].incidentTime, array[i].host, maxNetto);
                    array.splice(i + 1, 1);
                } else {
                    if (array[i].incidentTime !== undefined) {
                        array[i] = createIncidentObject(array[i].incidentTime, array[i].incidentTime, array[i].host, array[i].nettoTime)
                        i++;
                    } else {
                        array[i] = createIncidentObject(array[i].incidentStart, array[i].incidentEnd, array[i].host, array[i].nettoTime)
                        i++;
                    }

                }
            } else {
                array[i] = createIncidentObject(array[i].incidentTime, array[i].incidentTime, array[i].host, array[i].nettoTime)
                i++;
            }
        }
    }
    return array;
}

const checkForGlobalIncidents = (array) => {

    const sortedArray = array.sort((firstItem, secondItem) => {
        if (firstItem.incidentStart < secondItem.incidentStart) {
            if (firstItem.incidentEnd < secondItem.incidentEnd) {
                return 1
            } else return 0
        } else if (firstItem.incidentStart > secondItem.incidentStart) {
            if (firstItem.incidentEnd > secondItem.incidentEnd) {
                return -1
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

const getDataFromInflux = async () => {
    const url = "https://influxapi.egamings.com/query?q=";
    let query = '';
    let queryData = {
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

const getIncidentsFromArray = async () => {

    const resultArray = await getDataFromInflux()
    let incidents = [];


    for (const result of resultArray) {
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
    incidents = checkForGlobalIncidents(incidents)
    return incidents;
}

const main = async () => {
    let result;
    let dateInsertResult;

    const incidents = await getIncidentsFromArray()
    console.log(incidents.length)
    if(incidents.length !== 0){
        for (const incident of incidents) {
            result = await insertIncidentsIntoDB(incident);
        };
        dateInsertResult = await insertDate(dateTo);
    } else {
        console.log("No incidents to insert")
    }
}

await main()
