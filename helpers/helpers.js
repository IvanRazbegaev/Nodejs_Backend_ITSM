import {DatabaseConnection} from "../database_connection.js";
import moment from "moment/moment.js";

const incidentsConnection = new DatabaseConnection('incidents');
const haConnection = new DatabaseConnection('highAvailability');


// Используем библиотеку momentjs для получения даты начала и конца поисков в инфлюксе. Длинно да, но Date в ноде делает фигню вместо того, что должен делать - формат new Date (year, month, 1) выдает фигню вместо даты начала месяца
export const getPeriodStartDate = (month, year) => {
    return moment().year(year).month(month - 1).date(1).hour(0).minute(0).second(0).utc().format()
}

export const getPeriodEndDate = (month, year) => {
    return moment().year(year).month(month).date(1).hour(0).minute(0).second(0).utc().format()
}

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

export const convertTimestampToDate = (timestamp) => {
    return new Date(timestamp).toJSON().slice(0, 19).replace('T', ' ');
}

export const insertDowntimesIntoDB = async (obj) => {
    const dwntStart = convertTimestampToDate(obj.dwntStart * 1000)
    const dwntEnd = convertTimestampToDate(obj.dwntEnd * 1000)

    const insertResult = await haConnection.insertValuesIntoHa(dwntStart, dwntEnd, obj.dwntLength, obj.node, obj.highLimit)
}

export const checkHaMonth = async (month, year, highLimit) => {

    const periodStart = convertTimestampToDate(getPeriodStartDate(month, year));
    const periodEnd = convertTimestampToDate(getPeriodEndDate(month, year));

    const checkResult = await haConnection.checkValuesInHa(periodStart, periodEnd, highLimit)

    return checkResult;
}

export const checkAllInHa = async() => {
    const allData = await haConnection.getAllValuesInHa();
    return allData;
}
