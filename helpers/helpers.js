//insertDate вставка в БД timestamp запуска данного скрипта
import {DatabaseConnection} from "../database_connection.js";

const dbConnection = new DatabaseConnection('incidents');

export const insertDate = async (date) => {
    const insertResult = await dbConnection.insertValuesIntoService(date);
}

//lastCheckTimestamp достает из базы последнюю запись с timestamp запуска данного скрипта

export const lastCheckTimestamp = async () => {
    const lastCheckTimestamp = await dbConnection.selectLastValueInService()
    return Object.assign({}, lastCheckTimestamp)[0].lastStarted;
}

export const insertIncidentsIntoDB = async (data) => {
    const incStart = convertTimestampToDate(data.incidentStart)
    const incEnd = convertTimestampToDate(data.incidentEnd)
    const incLength = (data.incidentEnd - data.incidentStart)/(1 * 60 * 1000) // Длинна инцидента в минутах
    const desc = `${data.host}, ${data.nettoTime}`

    const insertResult = await dbConnection.insertValuesIntoIncidents( incStart, incEnd, incLength, desc, '' );
    console.log(insertResult)
}

const convertTimestampToDate = (timestamp) => {
    return new Date(timestamp).toJSON().slice(0, 19).replace('T', ' ');
}


