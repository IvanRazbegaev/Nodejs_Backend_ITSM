import express from "express";
import {DatabaseConnection} from "./database_connection.js";
import {main} from "./incidents.js";
import cors from "cors";
import {haMain} from "./high_availability.js";
import {checkAllInHa, checkHaMonth} from "./helpers/helpers.js";
import {isNull} from "util";

const server = express();
const corsOptions = {
    origin: '*'
}
const port = 8000

server.use(cors(corsOptions))
    .use(express.json())

server.route('/tracker')
    .get(async (req, res) => {
        let result = {}
        const dbConnection = new DatabaseConnection("incidents");
        result = await dbConnection.selectAllValuesInIncidents(req.query.start, req.query.end)
        res.send(JSON.stringify(result))
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
        res.send(JSON.stringify("Done"))
        })
    .delete((req, res) => {
        const dbConnection = new DatabaseConnection("incidents")
        dbConnection.deleteValue(req.query.id)
        res.send(JSON.stringify("Done"))
    })

server.route('/incidents')
    .get(async (req, res) => {
        const result = await main()
        res.send(JSON.stringify(result))
    })
server.route('/ha')
    .post(async (req, res) => {
        const result = await haMain(req.body.month, req.body.year, req.body.limit)
        res.send(JSON.stringify(result))
    })
    .get(async (req, res) => {
        let result;
        if(req.query.month && req.query.year && req.query.limit){
            result = await checkHaMonth(req.query.month, req.query.year, Number(req.query.limit))
        } else {
            result = await checkAllInHa()
        }

        res.send(result)
    })
server.listen(`${port}`, () => {
    console.log("Server is running and listening on port ", port)
});

