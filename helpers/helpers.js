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
    const lastCheckTimestamp = await incidentsConnection.selectLastValueInService();
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

export const insertDowntimesIntoDB = async (obj, incidentId) => {
    const dwntStart = convertTimestampToDate(obj.dwntStart * 1000)
    const dwntEnd = convertTimestampToDate(obj.dwntEnd * 1000)

    const res = await haConnection.insertValuesIntoHa(dwntStart, dwntEnd, obj.dwntLength, obj.node, obj.highLimit, incidentId)
}

export const insertReqDropsIntoDB = async(obj) => {
    const dwntStart = convertTimestampToDate(obj.reqDropStart * 1000)
    const dwntEnd = convertTimestampToDate(obj.reqDropEnd * 1000)

    const res = await haConnection.insertReqDropsIntoHa(dwntStart, dwntEnd, obj.reqDropLenght, obj.host)
}


export const checkHaMonth = async (month, year, highLimit) => {

    const periodStart = getPeriodStartDate(month, year);
    const periodEnd = getPeriodEndDate(month, year);

    const checkResult = await haConnection.checkValuesInHa(periodStart, periodEnd, highLimit)

    return checkResult;
}

export const checkReqDropInHa = async (obj) => {
    const reqDropStart = convertTimestampToDate(obj.reqDropStart * 1000)
    const reqDropEnd = convertTimestampToDate(obj.reqDropEnd * 1000)

    const checkResult = await haConnection.checkValuesInHa(reqDropStart, reqDropEnd)

    return checkResult;
}

export const checkAllInHa = async() => {
    const allData = await haConnection.getAllValuesInHa();
    return allData;
}

export const selectIdInIncidents = async (dateFrom, dateTo) => {

    const incidentIds = await incidentsConnection.selectAllValuesInIncidents('id', dateFrom, dateTo)
    const result = await Object.assign({}, incidentIds)[0];
    if (result === undefined){
        return ''
    }
    return result.id;
}

export const deleteIdFromHa = async (id) => {
    const result = await haConnection.deleteValueFromHa(id)
    return result;
}
