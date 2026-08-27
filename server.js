const express = require("express");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let goldPrice = 0;

// HOME PAGE
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Gold Price Updater</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, sans-serif;
      background: #f6f6f7;
      margin: 0;
      padding: 40px;
    }

    .container {
      max-width: 700px;
      margin: auto;
      background: white;
      padding: 35px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    }

    h1 {
      margin-top: 0;
      color: #202223;
    }

    .card {
      background: #f6f6f7;
      padding: 25px;
      border-radius: 10px;
      margin-top: 20px;
    }

    label {
      display: block;
      font-weight: bold;
      margin-bottom: 10px;
    }

    input {
      width: 100%;
      padding: 14px;
      font-size: 18px;
      border: 1px solid #babfc3;
      border-radius: 8px;
      margin-bottom: 15px;
    }

    button {
      background: #008060;
      color: white;
      border: none;
      padding: 14px 25px;
      font-size: 16px;
      border-radius: 8px;
      cursor: pointer;
    }

    button:hover {
      background: #006e52;
    }

    .price-box {
      margin-top: 25px;
      padding: 20px;
      background: #e3f1df;
      border-radius: 10px;
    }

    .price {
      font-size: 30px;
      font-weight: bold;
      color: #008060;
      margin-top: 8px;
    }

    .note {
      margin-top: 25px;
      color: #616161;
      line-height: 1.6;
    }
  </style>
</head>

<body>

  <div class="container">

    <h1>💰 Gold Price Updater</h1>

    <div class="card">

      <form action="/update-gold-price" method="POST">

        <label>Today's Gold Price (Per Gram)</label>

        <input
          type="number"
          name="goldPrice"
          placeholder="Enter gold price per gram"
          value="${goldPrice}"
          required
        >

        <button type="submit">
          Update Gold Price
        </button>

      </form>

    </div>

    <div class="price-box">

      Current Gold Price

      <div class="price">
        ₹ ${goldPrice} / Gram
      </div>

    </div>

    <div class="note">

      <b>Next Step:</b><br>

      હવે દરેક jewellery product નો Gold Weight અને Making Charge
      system માં add કરીને automatic product price update system connect કરીશું.

    </div>

  </div>

</body>
</html>
  `);
});


// UPDATE GOLD PRICE
app.post("/update-gold-price", (req, res) => {

  goldPrice = Number(req.body.goldPrice);

  console.log("Gold Price Updated:", goldPrice);

  res.redirect("/");
});


// SERVER
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Gold Price Updater running on port " + PORT);
});
