const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

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

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Unauthorized" });
  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    await jwtVerify(token, JWKS);
    next();
  } catch (error) {
    return res.status(403).json({ message: "Forbidden" });
  }
};

const db = client.db("tutorhub");
const tutorCollection = db.collection("tutor");
const bookingCollection = db.collection("bookings");

let isConnected = false;
async function connectDB() {
  if (!isConnected) {
    await client.connect();
    isConnected = true;
    console.log("MongoDB connected");
  }
}

app.get("/", (req, res) => {
  res.send("Server is running fine");
});

app.get("/tutor", async (req, res) => {
  try {
    await connectDB();
    const { search, startDate, endDate } = req.query;
    let query = {};
    if (search) query.tutorName = { $regex: search, $options: "i" };
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = startDate;
      if (endDate) query.startDate.$lte = endDate;
    }
    const result = await tutorCollection.find(query).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/tutor/featured", async (req, res) => {
  try {
    await connectDB();
    const result = await tutorCollection.find({}).limit(6).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/tutor/user/:email", async (req, res) => {
  try {
    await connectDB();
    const { email } = req.params;
    const result = await tutorCollection.find({ addedBy: email }).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/tutor/:id", verifyToken, async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const result = await tutorCollection.findOne({ _id: new ObjectId(id) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/tutor", async (req, res) => {
  try {
    await connectDB();
    const tutorData = req.body;
    const result = await tutorCollection.insertOne(tutorData);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/tutor/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const result = await tutorCollection.deleteOne({ _id: new ObjectId(id) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/bookings", async (req, res) => {
  try {
    await connectDB();
    const bookingData = req.body;

    const tutor = await tutorCollection.findOne({
      _id: new ObjectId(bookingData.tutorId),
    });

    if (!tutor) return res.status(404).json({ message: "Tutor not found" });

    const slots = parseInt(tutor.totalSlots);

    if (slots <= 0)
      return res.status(400).json({ message: "This session is fully booked" });

    const result = await bookingCollection.insertOne({
      ...bookingData,
      status: "confirmed",
    });

    await tutorCollection.updateOne(
      { _id: new ObjectId(bookingData.tutorId) },
      { $set: { totalSlots: slots - 1 } }
    );

    res.json(result);
  } catch (err) {
    console.error("Booking error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/bookings/:email", async (req, res) => {
  try {
    await connectDB();
    const { email } = req.params;
    const result = await bookingCollection
      .find({ studentEmail: email })
      .toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/bookings/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;

    const booking = await bookingCollection.findOne({ _id: new ObjectId(id) });

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.status === "cancelled")
      return res.status(400).json({ message: "Booking is already cancelled" });

    const result = await bookingCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "cancelled" } }
    );

    const tutor = await tutorCollection.findOne({
      _id: new ObjectId(booking.tutorId),
    });

    await tutorCollection.updateOne(
      { _id: new ObjectId(booking.tutorId) },
      { $set: { totalSlots: parseInt(tutor.totalSlots) + 1 } }
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;