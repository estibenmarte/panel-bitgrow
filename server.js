const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ServerApiVersion } = require('mongodb');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

// --- CONFIGURACIÓN COMPLETA (Tus datos ya están aquí) ---
const uri = "mongodb+srv://bitgrow_user:S3biFEQDkmhOfJla@bitgrow.4fcvwtc.mongodb.net/?retryWrites=true&w=majority&appName=bitgrow";
const BscApiKey = '7P7G7C5CCQP1H4X7YKHSPPMCV5JGFQA3S3';
const DEPOSIT_WALLET = '0xa399Ea0bcCAB9ea47862F2d944FD500aab523541'.toLowerCase(); 


// --- CÓDIGO DEL SERVIDOR (No necesitas modificar nada más) ---

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db; 

async function connectToDatabase() {
  try {
    await client.connect();
    db = client.db("bitgrow_db");
    console.log("¡Conexión exitosa a la base de datos de MongoDB Atlas en la nube!");
  } catch (err) {
    console.error("Falló la conexión a la base de datos. VERIFICA TU CONTRASEÑA O LA CONFIGURACIÓN DE ACCESO A LA RED.", err);
    process.exit(1);
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'panel_control.html'));
});

app.post('/api/verificar-txid', async (req, res) => {
    const { txid } = req.body;
    if (!txid) return res.status(400).json({ status: 'INVALIDO' });

    try {
        const depositoExistente = await db.collection('depositos').findOne({ txid: txid });
        if (depositoExistente) {
            return res.json({ status: 'REPETIDO' });
        }

        const txDetails = await checkBep20Transaction(txid);
        if (txDetails.isValid) {
            return res.json({ status: 'NUEVO', txid, details: txDetails });
        } else {
            return res.json({ status: 'INVALIDO' });
        }
    } catch (error) {
        console.error("Error en /api/verificar-txid:", error);
        res.status(500).json({ status: 'ERROR_SERVIDOR' });
    }
});

app.post('/api/aprobar-txid', async (req, res) => {
    const { txid } = req.body;
    if (!txid) return res.status(400).json({ mensaje: 'No se proporcionó TXID.' });

    try {
        const depositoExistente = await db.collection('depositos').findOne({ txid: txid });
        if (depositoExistente) {
            return res.status(409).json({ mensaje: 'Este TXID ya fue aprobado.' });
        }

        await db.collection('depositos').insertOne({
            txid: txid,
            fechaAprobacion: new Date()
        });

        console.log(`TXID APROBADO Y REGISTRADO EN LA NUBE: ${txid}`);
        res.status(200).json({ mensaje: 'Depósito aprobado y guardado en la base de datos en la nube.' });

    } catch (error) {
        console.error("Error en /api/aprobar-txid:", error);
        res.status(500).json({ mensaje: 'Error crítico al guardar el depósito.' });
    }
});

async function checkBep20Transaction(txid) {
    const url = `https://api.bscscan.com/api?module=proxy&action=eth_getTransactionByHash&txhash=${txid}&apikey=${BscApiKey}`;
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.result && data.result.to && data.result.input && data.result.input.length > 70) {
            const recipientAddress = ("0x" + data.result.input.substring(34, 74)).toLowerCase();
            if (recipientAddress === DEPOSIT_WALLET) {
                const amount = parseInt("0x" + data.result.input.substring(74)) / 1e18;
                return { isValid: true, amount, network: 'BEP20' };
            }
        }
    } catch (error) {
        console.error("Error al contactar BscScan:", error.message);
    }
    
    return { isValid: false };
}

connectToDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor de Bitgrow corriendo en http://localhost:${PORT}`);
        console.log(`Accede a tu panel en http://localhost:3000/panel_control.html`);
    });
});