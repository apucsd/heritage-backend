const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection URL
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db("heritage-nest");
    const collection = db.collection("users");
    const propertyCollection = db.collection("properties");

    // User Registration
    app.post("/register", async (req, res) => {
      const { name, email, password, phone } = req.body;

      // Check if email already exists
      const existingUser = await collection.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "User already exists",
        });
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert user into the database
      await collection.insertOne({
        name,
        email,
        phone,
        password: hashedPassword,
        role: "user",
      });

      res.status(201).json({
        success: true,
        message: "User registered successfully",
      });
    });

    // User Login
    app.post("/login", async (req, res) => {
      const { email, password } = req.body;

      // Find user by email
      const user = await collection.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Compare hashed password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Generate JWT token
      const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
        expiresIn: process.env.EXPIRES_IN,
      });

      res.json({
        success: true,
        message: "Login successful",
        token,
      });
    });

    // ==============================================================
    // WRITE  CODE HERE

    // =================get all route==================
    app.get("/properties", async (req, res) => {
      try {
        const result = await propertyCollection.find().toArray();

        res.status(200).send(result);
      } catch (err) {
        res
          .status(500)
          .send({ error: "Failed to find property", details: err.message });
      }
    });
    // =================get filter====================
    app.get("/properties/search-query", async (req, res) => {
      try {
        const { budget, propertyType, location, searchText } = req.query;

        console.log(req.query);

        // Initialize the aggregation pipeline
        const pipeline = [];

        // Text search (must be the first stage in the pipeline if used)
        if (searchText) {
          pipeline.push({
            $match: {
              $text: { $search: searchText },
            },
          });
        }

        // Filter by budget
        if (budget) {
          pipeline.push({
            $match: {
              price: {
                ...(budget && { $lte: Number(budget) }),
              },
            },
          });
        }

        // Filter by property type
        if (propertyType) {
          pipeline.push({
            $match: {
              property_type: propertyType,
            },
          });
        }

        // Filter by location
        if (location) {
          pipeline.push({
            $match: {
              location: location,
            },
          });
        }

        // Fetch properties using aggregation pipeline
        const result = await propertyCollection.aggregate(pipeline).toArray();

        res.status(200).send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
      }
    });

    // =================get single====================
    app.get("/properties/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await propertyCollection.findOne({
          _id: new ObjectId(id),
        });

        res.status(200).send(result);
      } catch (err) {
        res
          .status(500)
          .send({ error: "Failed to find property", details: err.message });
      }
    });

    // =================update single====================
    app.patch("/properties/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updateData = req.body;

        // Update the updated_at field to the current timestamp
        updateData.updated_at = new Date().toISOString();

        const result = await propertyCollection.updateOne(
          { _id: new ObjectId(id) }, // Find the property by ID
          { $set: updateData } // Only update the fields that are provided
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: "Property not found" });
        }

        res
          .status(200)
          .send({ message: "Property updated successfully", result });
      } catch (err) {
        res
          .status(500)
          .send({ error: "Failed to update property", details: err.message });
      }
    });

    // =====================delete route===========================
    app.delete("/properties/:id", async (req, res) => {
      try {
        const id = req.params.id;

        // Delete the property by ID
        const result = await propertyCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ error: "Property not found" });
        }

        res.status(200).send({ message: "Property deleted successfully" });
      } catch (err) {
        res
          .status(500)
          .send({ error: "Failed to delete property", details: err.message });
      }
    });
    // =====================Post route===========================

    app.post("/properties", async (req, res) => {
      try {
        const property = req.body;

        // Add timestamps
        const timestamp = new Date().toISOString();
        property.created_at = timestamp;
        property.updated_at = timestamp;

        // Insert property into the collection
        const result = await propertyCollection.insertOne(property);

        res.status(201).send(result);
      } catch (err) {
        console.error("Error occurred while creating property:", err.message);
        res
          .status(500)
          .send({ error: "Failed to create property", details: err.message });
      }
    });
    // ===========================bid route===================================
    app.patch("/properties/:id/bid", async (req, res) => {
      const { id } = req.params;
      const { bid_amount, bidder_id, name, email, phone } = req.body;

      try {
        // Find the property by ID
        const property = await propertyCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!property) {
          return res.status(404).send("Property not found");
        }

        // Validate bid amount
        if (
          bid_amount <= property.starting_bid ||
          bid_amount <= property.current_bid
        ) {
          return res.status(400).send("Invalid bid amount");
        }

        // Build the update object
        const updateData = {
          current_bid: bid_amount,
          bid_time: new Date(),
          bidder_id: bidder_id || property.bidder?.bidder_id,
          name,
          email,
          phone,
        };

        // Update the property with the new bid
        const result = await propertyCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        res.status(200).send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
      }
    });

    // ==============================================================

    // Start the server
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  } finally {
  }
}

run().catch(console.dir);

// Test route
app.get("/", (req, res) => {
  const serverStatus = {
    message: "Server is running smoothly",
    timestamp: new Date(),
  };
  res.json(serverStatus);
});
