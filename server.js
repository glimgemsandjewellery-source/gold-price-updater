const express = require("express");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let goldPrice = 0;

// ==========================================
// SHOPIFY SETTINGS
// ==========================================

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// INR થી USD conversion
const INR_TO_USD = Number(process.env.INR_TO_USD || 0.012);

// ==========================================
// HOME PAGE
// ==========================================

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

</style>

</head>

<body>

<div class="container">

<h1>💰 Gold Price Updater</h1>

<div class="card">

<form action="/update-gold-price" method="POST">

<label>Today's Gold Price</label>

<input
type="number"
name="goldPrice"
placeholder="Enter today's gold price"
value="${goldPrice}"
required
>

<button type="submit">
Update All Product Prices
</button>

</form>

</div>

<div class="price-box">

<b>Current Gold Price:</b>

<div class="price">
₹ ${goldPrice}
</div>

</div>

</div>

</body>

</html>

  `);

});


// ==========================================
// UPDATE GOLD PRICE + ALL SHOPIFY PRODUCTS
// ==========================================

app.post("/update-gold-price", async (req, res) => {

  try {

    goldPrice = Number(req.body.goldPrice);

    if (!goldPrice || goldPrice <= 0) {
      return res.send("❌ Please enter a valid gold price.");
    }

    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
      return res.send(`
        <h1>❌ Shopify Settings Missing</h1>
        <p>Please add SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN in Render Environment Variables.</p>
        <a href="/">Go Back</a>
      `);
    }

    console.log("Today's Gold Price:", goldPrice);

    // GET ALL PRODUCTS
    const productsResponse = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2025-01/products.json?limit=250`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    if (!productsResponse.ok) {

      const errorText = await productsResponse.text();

      console.log("Shopify Error:", errorText);

      throw new Error("Unable to connect to Shopify API");

    }

    const data = await productsResponse.json();

    const products = data.products || [];

    let updatedProducts = 0;

    // LOOP THROUGH PRODUCTS
    for (const product of products) {

      // GET PRODUCT METAFIELDS
      const metafieldsResponse = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2025-01/products/${product.id}/metafields.json`,
        {
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN
          }
        }
      );

      if (!metafieldsResponse.ok) {
        console.log("Could not get metafields for:", product.title);
        continue;
      }

      const metafieldsData = await metafieldsResponse.json();

      const metafields = metafieldsData.metafields || [];


      // FIND GOLD WEIGHT
      const weightField = metafields.find(
        item =>
          item.namespace === "custom" &&
          (
            item.key === "gold_weight" ||
            item.key === "weight"
          )
      );


      // FIND MAKING CHARGE
      const makingField = metafields.find(
        item =>
          item.namespace === "custom" &&
          (
            item.key === "making_charge" ||
            item.key === "makingcharge"
          )
      );


      // PRODUCT પાસે WEIGHT નથી તો SKIP
      if (!weightField) {

        console.log(
          "Skipped (No Gold Weight):",
          product.title
        );

        continue;

      }


      const goldWeight = Number(weightField.value);

      const makingCharge = makingField
        ? Number(makingField.value)
        : 0;


      // ==========================================
      // PRICE CALCULATION
      // ==========================================

      // અહીં Gold Price × Product Gold Weight
      const priceINR =
        (goldPrice * goldWeight) +
        makingCharge;


      // INR → USD
      const priceUSD =
        priceINR * INR_TO_USD;


      const finalPrice =
        Number(priceUSD.toFixed(2));


      // UPDATE ALL VARIANTS
      for (const variant of product.variants) {

        const updateResponse = await fetch(
          `https://${SHOPIFY_STORE}/admin/api/2025-01/variants/${variant.id}.json`,
          {
            method: "PUT",

            headers: {
              "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
              "Content-Type": "application/json"
            },

            body: JSON.stringify({

              variant: {

                id: variant.id,

                price: finalPrice.toFixed(2)

              }

            })

          }
        );

        if (!updateResponse.ok) {

          const errorText = await updateResponse.text();

          console.log(
            "Variant Update Error:",
            errorText
          );

        }

      }


      updatedProducts++;

      console.log(
        "Updated:",
        product.title,
        "USD:",
        finalPrice
      );

    }


    res.send(`

      <h1>✅ Products Updated Successfully!</h1>

      <h2>${updatedProducts} Products Updated</h2>

      <p>Today's Gold Price: ₹ ${goldPrice}</p>

      <p>All eligible Shopify product prices have been updated.</p>

      <br>

      <a href="/">← Go Back</a>

    `);

  }

  catch (error) {

    console.error(error);

    res.send(`

      <h1>❌ Error Updating Products</h1>

      <p>${error.message}</p>

      <br>

      <a href="/">Go Back</a>

    `);

  }

});


// ==========================================
// SERVER
// ==========================================

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {

  console.log(
    "Gold Price Updater running on port " + PORT
  );

});
