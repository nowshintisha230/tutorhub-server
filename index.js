const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function connectDB() {
  try {
    await client.connect();
    console.log("MongoDB connected successfully");
  } catch (err) {
    console.error("MongoDB connection failed:", err);
  }
}

connectDB();

const db = client.db("tutorhub");
const tutorCollection = db.collection("tutor");
const bookingCollection = db.collection("bookings");

app.get("/", (req, res) => {
  res.send("server is running fine");
});

// home page — 6টা featured tutor
app.get("/tutor/featured", async (req, res) => {
  try {
    const result = await tutorCollection.find({}).limit(6).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// get tutors by user email
app.get("/tutor/user/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const result = await tutorCollection.find({ addedBy: email }).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// all tutors
app.get("/tutor", async (req, res) => {
  try {
    const result = await tutorCollection.find({}).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// get single tutor
app.get("/tutor/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await tutorCollection.findOne({
      _id: new ObjectId(id),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// add tutor
app.post("/tutor", async (req, res) => {
  try {
    const tutorData = req.body;
    const result = await tutorCollection.insertOne(tutorData);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// delete tutor
app.delete("/tutor/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await tutorCollection.deleteOne({
      _id: new ObjectId(id),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// create booking
app.post("/bookings", async (req, res) => {
  try {
    const bookingData = req.body;
    const result = await bookingCollection.insertOne({
      ...bookingData,
      status: "confirmed",
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// get bookings by email
app.get("/bookings/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const result = await bookingCollection
      .find({ studentEmail: email })
      .toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// cancel booking
app.patch("/bookings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await bookingCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "cancelled" } }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});