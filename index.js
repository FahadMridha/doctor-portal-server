const express = require("express");
const cors = require("cors");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
// const { query } = require("express");
// const { default: Stripe } = require("stripe");

require("dotenv").config();

// This is your test secret API key.
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const port = process.env.PORT || 5000;

const app = express();

//middleware

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("doctor portal server is running");
});

// const uri = "mongodb://localhost:27017";
// const client = new MongoClient(uri);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ouw6pvz.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifiedJwt(req, res, next) {
  const authHeader = req.headers.authorazition;
  if (!authHeader) {
    return res.status(401).send("unauthoraze access");
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (error, decoded) {
    if (error) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}
async function run() {
  try {
    const appiontmentOptionscollection = client
      .db("doctorsPortal")
      .collection("AppiontmentOptions");

    const bookingCollection = client.db("doctorsPortal").collection("booking");
    const usersCollection = client.db("doctorsPortal").collection("users");
    const doctorsCollection = client.db("doctorsPortal").collection("doctors");

    //NOTE:Make sure you are verifyAdmin after JWTverify
    const verifyAdmin = async (req, res, next) => {
      // console.log("inside admin:", req.decoded.email);
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "Forbiden access" });
      }

      next();
    };

    //use aggreaget to query mulipul data and hen marge
    app.get("/appiontmentOptions", async (req, res) => {
      const date = req.query.date;
      const query = {};
      const options = await appiontmentOptionscollection.find(query).toArray();

      ///get the booking of the provider data
      const bookingQuery = { appiontmentDate: date };
      const alreadyBooked = await bookingCollection
        .find(bookingQuery)
        .toArray();

      ///code carefully

      options.forEach((option) => {
        const optionsBooked = alreadyBooked.filter(
          (book) => book.tretment === option.name
        );
        const bookSlots = optionsBooked.map((book) => book.slot);

        const remaningSlots = option.slots.filter(
          (slot) => !bookSlots.includes(slot)
        );
        option.slots = remaningSlots;
      });
      res.send(options);
    });

    //v2/appiontmentOptions--why missing?

    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;
      console.log(price);

      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        " payment_method_types": ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/appointmentSpecialty", async (req, res) => {
      const query = {};
      const result = await appiontmentOptionscollection
        .find(query)
        .project({ name: 1 })
        .toArray();
      res.send(result);
    });
    app.get("/bookings", verifiedJwt, async (req, res) => {
      const email = req.query.email;
      const decodecEmail = req.decoded.email;
      if (email !== decodecEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingCollection.findOne(query);
      res.send(booking);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;

      const query = {
        appiontmentDate: booking.appiontmentDate,
        email: booking.email,
        tretment: booking.tretment,
      };
      const alreadyBooked = await bookingCollection.find(query).toArray();
      if (alreadyBooked.length) {
        const message = `you have already booked on${booking.appiontmentDate}`;
        return res.send({ acknowledged: false, message });
      }
      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = {
        email: email,
      };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "1h",
        });
        return res.send({ accessToken: token });
      }

      res.status(403).send({ accessToken: "" });
    });
    app.get("/users", async (req, res) => {
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    });
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });

    app.put("/users/admin/:id", verifiedJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    // for temperory used ,any data add in server

    // app.get("/addprice", async (req, res) => {
    //   const filter = {};
    //   const options = { upsert: true };
    //   const updateDoc = {
    //     $set: {
    //       price: 99,
    //     },
    //   };
    //   const result = await appiontmentOptionscollection.updateMany(
    //     filter,
    //     updateDoc,
    //     options
    //   );

    //   res.send(result);
    // });
    app.get("/doctors", verifiedJwt, verifyAdmin, async (req, res) => {
      const query = {};
      const doctors = await doctorsCollection.find(query).toArray();
      res.send(doctors);
    });

    app.post("/doctors", verifiedJwt, verifyAdmin, async (req, res) => {
      const doctors = req.body;
      const result = await doctorsCollection.insertOne(doctors);
      res.send(result);
    });

    app.delete("/doctors/:id", verifiedJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await doctorsCollection.deleteOne(filter);
      res.send(result);
    });
  } catch (error) {
    console.error(error);
  }
}
run().catch((error) => console.log(error));

app.listen(port, console.log(`server running on port: ${port}`));
