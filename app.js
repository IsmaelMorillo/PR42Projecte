const express = require('express')
const fs = require('fs/promises')
const url = require('url')
const post = require('./post.js')
const { v4: uuidv4 } = require('uuid')
var mysql = require('mysql2');

// Wait 'ms' milliseconds
function wait (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Start HTTP server
const app = express()

// Set port number
const port = process.env.PORT || 3000

// Publish static files from 'public' folder
app.use(express.static('public'))

// Activate HTTP server
const httpServer = app.listen(port, appListen)
function appListen () {
  console.log(`Listening for HTTP queries on: http://localhost:${port}`)
}

// Set URL rout for POST queries
app.post('/dades', getDades)
async function getDades (req, res) {
  let receivedPOST = await post.getPostObject(req)
  let result = {};

  if (receivedPOST) {
    if (receivedPOST.type == "llistaUsuaris") {
      var objUsersList = await queryDatabase("SELECT * FROM Usuaris");
      await wait(1500)
      result = { status: "OK", result: objUsersList } 
    }

    if (receivedPOST.type == "userInsert") {
      if (await queryDatabase(`SELECT * FROM Usuaris WHERE nom = "${receivedPOST.nom}" AND cognoms = "${receivedPOST.cognoms}"`)){
        result = { status: "KO", result: { error: "userRepeated" } }
      }

      if (!phonenumber(receivedPOST.phone)) {
        result = { status: "KO", result: { error: "phone" } }
      }
      
      else if (!email(receivedPOST.email)) {
        result = { status: "KO", result: { error: "email" } }
      }
        
      if (await queryDatabase(`SELECT * FROM Usuaris WHERE correu = "${receivedPOST.email}"`)){
        result = { status: "KO", result: { error: "emailRepeated" } }
      }

      if (await queryDatabase(`SELECT * FROM Usuaris WHERE telefon = "${receivedPOST.telefon}"`)){
        result = { status: "KO", result: { error: "telefonRepeated" } }
      }
      
      else {
        await queryDatabase(`INSERT INTO Usuaris (nom, cognoms, correu, telefon, direccio, ciutat) VALUES ('${receivedPOST.name}','${receivedPOST.surnames}','${receivedPOST.email}','${receivedPOST.phone}','${receivedPOST.address}','${receivedPOST.city}');`)
        result = { status: "OK" }
      }
    }

    if (receivedPOST.type == "modifyUser") {
      var objUsersList = await queryDatabase(`SELECT * FROM Usuaris WHERE id="${receivedPOST.id}"`);
      await wait(1500)
      result = { status: "OK", result: objUsersList }
    }

    if (receivedPOST.type == "updateUser") {
      var objUsersList = await queryDatabase(`UPDATE Usuaris SET nom="${receivedPOST.name}", cognoms="${receivedPOST.surnames}", correu="${receivedPOST.email}", telefon="${receivedPOST.phone}", direccio="${receivedPOST.address}", ciutat="${receivedPOST.city} WHERE id="${receivedPOST.id}"}"`);
      await wait(1500)
      result = { status: "OK", result: objUsersList }
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(result))
}

function phonenumber(inputtxt) {
  const phoneRegex = new RegExp(/^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{3})$/);
  if(phoneRegex.test(inputtxt)) {
    return true;
  }
  else {
    return false;
  }
}

function email(inputtxt) {
  const emailRegex = new RegExp(/^[A-Za-z0-9_!#$%&'*+\/=?`{|}~^.-]+@[A-Za-z0-9.-]+$/, "gm");

  if(emailRegex.test(inputtxt)) {
    return true;
  }
  else {
    return false;
  }
}


// Run WebSocket server
const WebSocket = require('ws')
const wss = new WebSocket.Server({ server: httpServer })
const socketsClients = new Map()
console.log(`Listening for WebSocket queries on ${port}`)

// What to do when a websocket client connects
wss.on('connection', (ws) => {

  console.log("Client connected")

  // Add client to the clients list
  const id = uuidv4()
  const color = Math.floor(Math.random() * 360)
  const metadata = { id, color }
  socketsClients.set(ws, metadata)

  // Send clients list to everyone
  sendClients()

  // What to do when a client is disconnected
  ws.on("close", () => {
    socketsClients.delete(ws)
  })

  // What to do when a client message is received
  ws.on('message', async (bufferedMessage) => {
    var messageAsString = bufferedMessage.toString()
    var messageAsObject = {}
    
    try { messageAsObject = JSON.parse(messageAsString) } 
    catch (e) { console.log("Could not parse bufferedMessage from WS message") }

    if (messageAsObject.type == "bounce") {
      var rst = { type: "bounce", message: messageAsObject.message }
      ws.send(JSON.stringify(rst));
    } else if (messageAsObject.type == "broadcast") {
      var rst = { type: "broadcast", origin: id, message: messageAsObject.message }
      broadcast(rst)
    } else if (messageAsObject.type == "private") {
      var rst = { type: "private", origin: id, destination: messageAsObject.destination, message: messageAsObject.message }
      private(rst)
    }
  })
})

// Send clientsIds to everyone
function sendClients () {
  var clients = []
  socketsClients.forEach((value, key) => {
    clients.push(value.id)
  })
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      var id = socketsClients.get(client).id
      var messageAsString = JSON.stringify({ type: "clients", id: id, list: clients })
      client.send(messageAsString)
    }
  })
}

// Send a message to all websocket clients
async function broadcast (obj) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      var messageAsString = JSON.stringify(obj)
      client.send(messageAsString)
    }
  })
}

// Send a private message to a specific client
async function private (obj) {
  wss.clients.forEach((client) => {
    if (socketsClients.get(client).id == obj.destination && client.readyState === WebSocket.OPEN) {
      var messageAsString = JSON.stringify(obj)
      client.send(messageAsString)
      return
    }
  })
}

// Perform a query to the database
function queryDatabase (query) {

  return new Promise((resolve, reject) => {
    var connection = mysql.createConnection({
      host: process.env.MYSQLHOST || "containers-us-west-138.railway.app",
      port: process.env.MYSQLPORT || 7852,
      user: process.env.MYSQLUSER || "root",
      password: process.env.MYSQLPASSWORD || "ddXdX0NbiTutVHXcqNYU",
      database: process.env.MYSQLDATABASE || "railway"
    });

    connection.query(query, (error, results) => { 
      if (error) reject(error);
      resolve(results);
    });
     
    connection.end();
  })
}