//insertDate вставка в БД timestamp запуска данного скрипта
import {DatabaseConnection} from "../database_connection.js";

const incidentsConnection = new DatabaseConnection('incidents');
const haConnection = new DatabaseConnection('highAvailability');

export const insertDate = async (date) => {
    const insertResult = await incidentsConnection.insertValuesIntoService(date);
}

//lastCheckTimestamp достает из базы последнюю запись с timestamp запуска данного скрипта

export const lastCheckTimestamp = async () => {
    const lastCheckTimestamp = await incidentsConnection.selectLastValueInService()
    return Object.assign({}, lastCheckTimestamp)[0].lastStarted;
}

export const insertIncidentsIntoDB = async (data) => {
    const incStart = convertTimestampToDate(data.incidentStart)
    const incEnd = convertTimestampToDate(data.incidentEnd)
    const incLength = (data.incidentEnd - data.incidentStart)/(1 * 60 * 1000) // Длинна инцидента в минутах
    const desc = `${data.host}, ${data.nettoTime}`

    const insertResult = await incidentsConnection.insertValuesIntoIncidents( incStart, incEnd, incLength, desc, '' );
}

const convertTimestampToDate = (timestamp) => {
    return new Date(timestamp).toJSON().slice(0, 19).replace('T', ' ');
}

export const insertDowntimesIntoDB = async (obj) => {
    const dwntStart = convertTimestampToDate(obj.dwntStart * 1000)
    const dwntEnd = convertTimestampToDate(obj.dwntEnd * 1000)
    const dwntLength = (obj.dwntEnd - obj.dwntStart)/(1 * 60 * 1000) // Длинна инцидента в минутах

    const insertResult = await haConnection.insertValuesIntoHa(dwntStart, dwntEnd, dwntLength, obj.node, obj.highLimit)
}

export const checkHaMonth = async (dateFrom, dateTo, highLimit) => {
    const checkResult = await haConnection.checkValuesInHa(dateFrom, dateTo, highLimit)
    return checkResult
}

