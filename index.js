const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const uri = process.env.MONGODB_URI;

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("tutorhub");

    const tutorCollection = db.collection("tutor");
    const bookingCollection = db.collection("bookings");

    // ================= TUTOR ROUTES =================

    app.get("/tutor", async (req, res) => {
      const result = await tutorCollection
        .aggregate([{ $limit: 6 }])
        .toArray();

      res.json(result);
    });

    app.get("/tutor/:id", async (req, res) => {
      const { id } = req.params;

      const result = await tutorCollection.findOne({
        _id: new ObjectId(id),
      });

      res.json(result);
    });

    app.post("/tutor", async (req, res) => {
      const tutorData = req.body;

      const result = await tutorCollection.insertOne(tutorData);

      res.json(result);
    });

    // ================= BOOKING ROUTES =================

    // create booking
    app.post("/bookings", async (req, res) => {
      const bookingData = req.body;

      const result = await bookingCollection.insertOne({
        ...bookingData,
        status: "booked",
      });

      res.json(result);
    });

    // get bookings by email
    app.get("/bookings/:email", async (req, res) => {
      const { email } = req.params;

      const result = await bookingCollection
        .find({
          studentEmail: email,
        })
        .toArray();

      res.json(result);
    });

    // cancel booking
    app.patch("/bookings/:id", async (req, res) => {
      const { id } = req.params;

      const result = await bookingCollection.updateOne(
        {
          _id: new ObjectId(id),
        },
        {
          $set: {
            status: "cancelled",
          },
        }
      );

      res.json(result);
    });

    await client.db("admin").command({ ping: 1 });

    console.log("MongoDB connected successfully");
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running fine");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});