import express from "express";
import {DatabaseConnection} from "./database_connection.js";
import {main} from "./incidents.js";
import cors from "cors";
import {haMain} from "./high_availability.js";
import {checkAllInHa, checkHaMonth, deleteIdFromHa} from "./helpers/helpers.js";
import {reqDropMain} from "./request_drop_search.js";

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
        result = await dbConnection.selectAllValuesInIncidents('all',req.query.start, req.query.end)
        res.send(JSON.stringify(result))
    })
    .post((req, res) => {
        const dbConnection = new DatabaseConnection("incidents")
        dbConnection.insertValuesIntoIncidents(
            req.body.incidentStart,
            req.body.incidentEnd,
            req.body.incLength,
            req.body.desc,
            req.body.comments
        );
        res.send(JSON.stringify("Done"))
        })
    .delete(async(req, res) => {
        const dbConnection = new DatabaseConnection("incidents")
        const result = await dbConnection.deleteValueFromIncidents(req.query.id)
        res.send(JSON.stringify(result))
    })

server.route('/incidents')
    .get(async (req, res) => {
        const result = await main()
        console.log(JSON.stringify(result))
        res.send(JSON.stringify(result))
    })
server.route('/ha')
    .post(async (req, res) => {
        await haMain(req.body.month, req.body.year, req.body.limit)
        if(req.body.limit === undefined){
            await reqDropMain(req.body.month, req.body.year)
        }
        res.send(JSON.stringify("Done"))
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
    .delete(async (req, res) => {
        let result;
        if(req.query.id !== undefined){
            result = await deleteIdFromHa(req.query.id)
        } else {
            result = 'id is invalid!'
        }
        res.send(result)
    })
server.listen(`${port}`, () => {
    console.log("Server is running and listening on port ", port)
});

