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
  res.send("Server is running fine");
});

// ===============================
// SEARCH + DATE FILTER
// ===============================
app.get("/tutor", async (req, res) => {
  try {
    const { search, startDate, endDate } = req.query;

    let query = {};

    if (search) {
      query.tutorName = {
        $regex: search,
        $options: "i",
      };
    }

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

// ===============================
// FEATURED
// ===============================
app.get("/tutor/featured", async (req, res) => {
  try {
    const result = await tutorCollection.find({}).limit(6).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// ⭐ GET TUTORS BY USER EMAIL
// (must be BEFORE /tutor/:id)
// ===============================
app.get("/tutor/user/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const result = await tutorCollection.find({ email }).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// SINGLE TUTOR BY ID
// ===============================
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

// ===============================
// ADD TUTOR
// ===============================
app.post("/tutor", async (req, res) => {
  try {
    const tutorData = req.body;
    const result = await tutorCollection.insertOne(tutorData);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// DELETE TUTOR
// ===============================
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

// ===============================
// ADD BOOKING
// ===============================
app.post("/bookings", async (req, res) => {
  try {
    const bookingData = req.body;

    const tutor = await tutorCollection.findOne({
      _id: new ObjectId(bookingData.tutorId),
    });

    if (!tutor) {
      return res.status(404).json({ message: "Tutor not found" });
    }

    if (parseInt(tutor.totalSlots) <= 0) {
      return res.status(400).json({ message: "This session is fully booked" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sessionDate = new Date(tutor.startDate);
    sessionDate.setHours(0, 0, 0, 0);

    if (today < sessionDate) {
      return res.status(400).json({ message: "Booking not started yet" });
    }

    const result = await bookingCollection.insertOne({
      ...bookingData,
      status: "confirmed",
    });

    await tutorCollection.updateOne(
      { _id: new ObjectId(bookingData.tutorId) },
      { $inc: { totalSlots: -1 } }
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// GET BOOKINGS BY EMAIL
// ===============================
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

// ===============================
// CANCEL BOOKING
// ===============================
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