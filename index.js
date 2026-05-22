const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// ✅ FIX 1: Restrict CORS to your frontend origin
app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// ✅ FIX 2: Guard against missing MONGODB_URI
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI environment variable is not set");

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ✅ FIX 3: Guard against missing CLIENT_URL for JWKS
const clientUrl = process.env.CLIENT_URL;
if (!clientUrl) throw new Error("CLIENT_URL environment variable is not set");

const JWKS = createRemoteJWKSet(new URL(`${clientUrl}/api/auth/jwks`));

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

// ────────────────────────────────────────────
// ROUTES
// ────────────────────────────────────────────

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
    console.error("GET /tutor error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ FIX 4: CRITICAL — specific routes (/featured, /user/:email) MUST come
// BEFORE the dynamic route (/tutor/:id), otherwise Express matches "featured"
// as an :id param and either crashes or returns the wrong data.

app.get("/tutor/featured", async (req, res) => {
  try {
    await connectDB();
    const result = await tutorCollection.find({}).limit(6).toArray();
    res.json(result);
  } catch (err) {
    console.error("GET /tutor/featured error:", err.message);
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
    console.error("GET /tutor/user/:email error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Dynamic :id route comes LAST among GET /tutor/* routes
app.get("/tutor/:id", verifyToken, async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;

    // ✅ FIX 5: Validate ObjectId before querying to avoid a 500 crash
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid tutor ID" });
    }

    const result = await tutorCollection.findOne({ _id: new ObjectId(id) });
    if (!result) return res.status(404).json({ message: "Tutor not found" });
    res.json(result);
  } catch (err) {
    console.error("GET /tutor/:id error:", err.message);
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
    console.error("POST /tutor error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put("/tutor/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid tutor ID" });
    }
    const updatedData = req.body;
    const result = await tutorCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );
    res.json(result);
  } catch (err) {
    console.error("PUT /tutor/:id error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/tutor/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid tutor ID" });
    }
    const result = await tutorCollection.deleteOne({ _id: new ObjectId(id) });
    res.json(result);
  } catch (err) {
    console.error("DELETE /tutor/:id error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/bookings", async (req, res) => {
  try {
    await connectDB();
    const bookingData = req.body;

    if (!ObjectId.isValid(bookingData.tutorId)) {
      return res.status(400).json({ message: "Invalid tutor ID" });
    }

    const tutor = await tutorCollection.findOne({
      _id: new ObjectId(bookingData.tutorId),
    });

    if (!tutor) return res.status(404).json({ message: "Tutor not found" });

    // ✅ FIX 6: Store totalSlots as a number consistently
    const slots = parseInt(tutor.totalSlots, 10);

    if (isNaN(slots) || slots <= 0) {
      return res.status(400).json({ message: "This session is fully booked" });
    }

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
    console.error("POST /bookings error:", err.message);
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
    console.error("GET /bookings/:email error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch("/bookings/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const booking = await bookingCollection.findOne({ _id: new ObjectId(id) });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.status === "cancelled") {
      return res.status(400).json({ message: "Booking is already cancelled" });
    }

    const result = await bookingCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "cancelled" } }
    );

    if (!ObjectId.isValid(booking.tutorId)) {
      return res.json(result); // Booking cancelled even if tutor ref is bad
    }

    const tutor = await tutorCollection.findOne({
      _id: new ObjectId(booking.tutorId),
    });

    if (tutor) {
      await tutorCollection.updateOne(
        { _id: new ObjectId(booking.tutorId) },
        { $set: { totalSlots: parseInt(tutor.totalSlots, 10) + 1 } }
      );
    }

    res.json(result);
  } catch (err) {
    console.error("PATCH /bookings/:id error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;