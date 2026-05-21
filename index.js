const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

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
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { payload } = await jwtVerify(token, JWKS);

    req.user = payload;

    next();
  } catch (error) {
    res.status(403).json({ message: "Forbidden" });
  }
};

async function connectDB() {
  try {
    await client.connect();
    console.log("MongoDB connected successfully");

    const db = client.db("tutorhub");

    const tutorCollection = db.collection("tutor");
    const bookingCollection = db.collection("bookings");

    app.get("/", (req, res) => {
      res.send("Server is running fine");
    });

    // Get all tutors
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

          if (startDate) {
            query.startDate.$gte = startDate;
          }

          if (endDate) {
            query.startDate.$lte = endDate;
          }
        }

        const result = await tutorCollection.find(query).toArray();

        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Featured tutors
    app.get("/tutor/featured", async (req, res) => {
      try {
        const result = await tutorCollection.find({}).limit(6).toArray();

        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Tutors by user email
    app.get("/tutor/user/:email", async (req, res) => {
      try {
        const { email } = req.params;

        const result = await tutorCollection
          .find({ addedBy: email })
          .toArray();

        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Single tutor
    app.get("/tutor/:id", verifyToken, async (req, res) => {
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

    // Add tutor
    app.post("/tutor", async (req, res) => {
      try {
        const tutorData = req.body;

        const result = await tutorCollection.insertOne(tutorData);

        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Delete tutor
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

    // Book session
    app.post("/bookings", async (req, res) => {
      try {
        const bookingData = req.body;

        const tutor = await tutorCollection.findOne({
          _id: new ObjectId(bookingData.tutorId),
        });

        if (!tutor) {
          return res.status(404).json({
            message: "Tutor not found",
          });
        }

        if (parseInt(tutor.totalSlots) <= 0) {
          return res.status(400).json({
            message: "This session is fully booked",
          });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sessionDate = new Date(tutor.startDate);
        sessionDate.setHours(0, 0, 0, 0);

        if (today < sessionDate) {
          return res.status(400).json({
            message: "Booking not started yet",
          });
        }

        const result = await bookingCollection.insertOne({
          ...bookingData,
          status: "confirmed",
        });

        await tutorCollection.updateOne(
          {
            _id: new ObjectId(bookingData.tutorId),
          },
          {
            $inc: { totalSlots: -1 },
          }
        );

        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // User bookings
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

    // Cancel booking
    app.patch("/bookings/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await bookingCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: { status: "cancelled" },
          }
        );

        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
  } catch (err) {
    console.error("MongoDB connection failed:", err);
  }
}

connectDB();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});