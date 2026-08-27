const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let goldPrice = 0;

// Home Page
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Gold Price Updater</title>

      <style>
        body {
          font-family: Arial, sans-serif;
          background: #f6f6f7;
          margin: 0;
          padding: 40px;
        }

        .container {
          max-width: 600px;
          margin: auto;
          background: white;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        h1 {
          margin-top: 0;
        }

        label {
          display: block;
          font-weight: bold;
          margin-top: 20px;
          margin-bottom: 8px;
        }

        input {
          width: 100%;
          padding: 14px;
          font-size: 18px;
          box-sizing: border-box;
          border: 1px solid #ccc;
          border-radius: 6px;
        }

        button {
          margin-top: 20px;
          width: 100%;
          padding: 14px;
          font-size: 16px;
          background: #008060;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }

        button:hover {
          background: #006e52;
        }

        .price-box {
          margin-top: 25px;
          padding: 20px;
          background: #f1f8f5;
          border-radius: 8px;
          font-size: 18px;
        }

        #message {
          margin-top: 15px;
          font-weight: bold;
          color: green;
        }
      </style>
    </head>

    <body>

      <div class="container">

        <h1>Gold Price Updater</h1>

        <label>Today's Gold Price</label>

        <input
          type="number"
          id="goldPrice"
          placeholder="Enter today's gold price"
          value="${goldPrice}"
        />

        <button onclick="updateGoldPrice()">
          Update Gold Price
        </button>

        <div id="message"></div>

        <div class="price-box">
          <strong>Current Gold Price:</strong>
          ₹ <span id="currentPrice">${goldPrice}</span>
        </div>

      </div>

      <script>

        async function updateGoldPrice() {

          const price = document.getElementById("goldPrice").value;

          if (!price || price <= 0) {
            document.getElementById("message").innerHTML =
              "Please enter a valid gold price.";
            return;
          }

          const response = await fetch("/update-gold-price", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              goldPrice: price
            })
          });

          const data = await response.json();

          document.getElementById("message").innerHTML =
            data.message;

          document.getElementById("currentPrice").innerHTML =
            price;
        }

      </script>

    </body>
    </html>
  `);
});


// Update Gold Price
app.post("/update-gold-price", (req, res) => {

  const { goldPrice: newGoldPrice } = req.body;

  goldPrice = Number(newGoldPrice);

  console.log("New Gold Price:", goldPrice);

  res.json({
    success: true,
    message: "Gold price updated successfully!",
    goldPrice: goldPrice
  });

});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
