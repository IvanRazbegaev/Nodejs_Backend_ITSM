import express from "express";
import {DatabaseConnection} from "./database_connection.js";
import {main} from "./incidents.js";

const server = express();
const port = 8000

server.route('/tracker')
    .get(async (req, res) => {
        let result = {}
        const dbConnection = new DatabaseConnection("incidents")
        result = await dbConnection.selectAllValuesInIncidents()
        res.send(result)
    })
    .post((req, res) => {
        const dbConnection = new DatabaseConnection("incidents")
        dbConnection.insertValuesIntoIncidents(
            '2022-02-01',
            '2022-02-02',
            5,
            'test',
            'some comments'
        );
        res.send("Done")
        })
    .delete((req, res) => {
        const dbConnection = new DatabaseConnection("incidents")
        dbConnection.deleteValue(req.query.id)
        res.send("Done")
    })

server.route('/incidents')
    .get(async (req, res) => {
        const result = await main()
        res.send(result)
    })
server.listen(`${port}`, () => {
    console.log("Server is running and listening on port ", port)
});

