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

        return new Promise ((resolve, reject) => {
            connection.query(sql, [ incStart, incEnd, incLength, desc, comment ], (err, result) => {
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
        const sql ='INSERT INTO service VALUE (?)'
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

    deleteValue(id) {
        const sql = `DELETE FROM incidents WHERE id=?`;
        const connection = this.setupDB(this.db);

        connection.query(sql,[ id ], (err, rows, fields) => {
            if (err) {
                throw err
            }
            console.log(`Row with ID ${id} was deleted`)
        })

        connection.end();
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

    selectAllValuesInIncidents() {
        const sql = 'SELECT * FROM incidents'
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


