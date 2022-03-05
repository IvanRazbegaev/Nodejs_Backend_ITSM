import mysql from "mysql";

export class DatabaseConnection {
    db;

    constructor(db) {
        this.db = db
    }

    setupDB(db) {
        return mysql.createConnection({
            host: "localhost",
            user: "root",
            database: db,
            password: "my_name_is_ivan"
        })
    }

    insertValuesIntoIncidents( incStart, incEnd, incLength, desc, comment ) {
        const sql ='INSERT INTO incidents VALUES (NULL,?,?,?,?,?)'
        const connection = this.setupDB(this.db);

        const from = incStart.slice(0, 19).replace('T', ' ');
        const to = incEnd.slice(0, 19).replace('T', ' ');

        return new Promise ((resolve, reject) => {
            connection.query(sql, [ from, to, incLength, desc, comment ], (err, result) => {
                if(err){
                    return reject(err)
                }
                connection.end();
                console.log("Inserted successfully")
                return resolve(result)
            })
        })
    }

    insertValuesIntoService( timestamp ){
        const sql ='INSERT INTO service VALUE (?, NULL)'
        const connection = this.setupDB(this.db);

        return new Promise((resolve, reject) => {
            connection.query(sql, [ timestamp ], (err, result) => {
                if(err){
                    return reject(err)
                }
                connection.end();
                console.log("Inserted successfully")
                return resolve(result)
            })
        })
    }

    insertValuesIntoHa( dwntStart, dwntEnd, dwntLength, host, highLimit, incRefId ) {
        const sql ='INSERT INTO ha VALUES (NULL,?,?,?,?,?, NULL, NULL, ?)'
        const connection = this.setupDB(this.db);

        return new Promise ((resolve, reject) => {
            connection.query(sql, [ dwntStart, dwntEnd, dwntLength, host, highLimit, incRefId ], (err, result) => {
                if(err){
                    return reject(err)
                }
                connection.end();
                console.log("Inserted successfully")
                return resolve(result)
            })
        })
    }

    insertReqDropsIntoHa(dwntStart, dwntEnd, dwntLength, host,) {
        const sql ='INSERT INTO ha VALUES (NULL,?,?,?,?,NULL, NULL, NULL, NULL)'
        const connection = this.setupDB(this.db);

        return new Promise ((resolve, reject) => {
            connection.query(sql, [ dwntStart, dwntEnd, dwntLength, host ], (err, result) => {
                if(err){
                    return reject(err)
                }
                connection.end();
                console.log("Inserted successfully")
                return resolve(result)
            })
        })
    }

    checkValuesInHa ( dateFrom, dateTo, highLimit ){
        const sql ='SELECT * from ha WHERE downtimeStart >= ? AND downtimeEnd <= ? AND (highLimit = ? OR highLimit IS NULL)';
        const connection = this.setupDB(this.db);

        return new Promise ((resolve, reject) => {
            connection.query(sql, [ dateFrom, dateTo, highLimit ], (err, result) => {
                if(err){
                    return reject(err)
                }
                connection.end();
                return resolve(result)
            })
        })
    }


    deleteValueFromIncidents(id) {
        const sql = `DELETE FROM incidents WHERE id=?`;
        const connection = this.setupDB(this.db);

        return new Promise ((resolve, reject) => {
            connection.query(sql, [ id ], (err, result) => {
                if(err){
                    return reject(err)
                }
                connection.end();
                return resolve(result)
            })
        })
    }

    deleteValueFromHa(id) {
        const sql = `DELETE FROM ha WHERE id=?`;
        const connection = this.setupDB(this.db);

        return new Promise ((resolve, reject) => {
            connection.query(sql, [ id ], (err, result) => {
                if(err){
                    return reject(err)
                }
                connection.end();
                return resolve(result)
            })
        })
    }

    deleteFromService(){
        const sql = `DELETE FROM service`;
        const connection = this.setupDB(this.db);

        connection.query(sql, (err, rows, fields) => {
            if (err) {
                throw err
            }
            console.log(`All records in service table were deleted`)
        })

        connection.end();
    }

    selectAllValuesInIncidents(column, start, end) {
        let sql = '';
        const connection = this.setupDB(this.db);
        const dateFrom = new Date(start).toJSON().slice(0, 19).replace('T', ' ');
        const dateTo = new Date(end).toJSON().slice(0, 19).replace('T', ' ');

        if(column === 'all'){
            sql = 'SELECT * FROM incidents WHERE start_date >= ? AND end_date <= ?'
            return new Promise((resolve, reject) => {
                connection.query(sql,[dateFrom, dateTo], (err, result) => {
                    if(err){
                        return reject(err)
                    }
                    connection.end();
                    return resolve(result)
                })
            })
        } else if (column === 'id'){
            console.log(dateFrom)
            console.log(dateTo)
            sql = 'SELECT id FROM incidents WHERE start_date >= ? AND end_date <= ?'
            return new Promise((resolve, reject) => {
                connection.query(sql,[dateFrom, dateTo], (err, result) => {
                    if(err){
                        return reject(err)
                    }
                    connection.end();
                    return resolve(result)
                })
            })
        }


    }

    getAllValuesInHa() {
        const sql = 'SELECT * FROM ha';
        const connection = this.setupDB(this.db);

        return new Promise((resolve, reject) => {
            connection.query(sql, (err, result) => {
                if(err){
                    return reject(err)
                }
                connection.end();
                return resolve(result)
            })
        })
    }

    async selectLastValueInService() {
        const sql = 'SELECT * FROM service ORDER BY lastStarted DESC LIMIT 1';
        const connection = this.setupDB(this.db);

        return new Promise((resolve, reject) => {
            connection.query(sql, (err, result) => {
                if(err){
                    return reject(err)
                }
                connection.end();
                return resolve(result)
            })
        })
    }
}



