const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

let goldPrice = 0;

// Server Running Check
app.get("/", (req, res) => {
  res.send("Gold Price Updater is running!");
});

// Get Current Gold Price
app.get("/gold-price", (req, res) => {
  res.json({
    success: true,
    goldPrice: goldPrice
  });
});

// Update Gold Price
app.post("/update-gold-price", (req, res) => {

  const { price } = req.body;

  if (!price) {
    return res.json({
      success: false,
      message: "Gold price is required"
    });
  }

  goldPrice = Number(price);

  res.json({
    success: true,
    message: "Gold price updated successfully",
    goldPrice: goldPrice
  });

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
