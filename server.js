const express = require("express");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* =========================================
   SETTINGS
========================================= */

// તમારું Shopify Store
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;

// Shopify Admin API Access Token
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// INR → USD Conversion Rate
// Example: 1 USD = ₹85
const USD_RATE = Number(process.env.USD_RATE || 85);

// છેલ્લે update થયેલો Gold Rate
let goldPrice = 0;


/* =========================================
   SHOPIFY API FUNCTION
========================================= */

async function shopifyRequest(endpoint, method = "GET", body = null) {

  const options = {
    method: method,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2025-10/${endpoint}`,
    options
  );

  const data = await response.json();

  if (!response.ok) {
    console.log("SHOPIFY ERROR:", data);
    throw new Error(JSON.stringify(data));
  }

  return data;
}


/* =========================================
   GET ALL PRODUCTS
========================================= */

async function getAllProducts() {

  let products = [];
  let url = `https://${SHOPIFY_STORE}/admin/api/2025-10/products.json?limit=250`;

  while (url) {

    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN
      }
    });

    const data = await response.json();

    if (data.products) {
      products = products.concat(data.products);
    }

    // હજુ માટે પ્રથમ 250 products
    url = null;
  }

  return products;
}


/* =========================================
   GET PRODUCT METAFIELDS
========================================= */

async function getProductMetafields(productId) {

  const data = await shopifyRequest(
    `products/${productId}/metafields.json`
  );

  return data.metafields || [];
}


/* =========================================
   UPDATE PRODUCT VARIANT PRICE
========================================= */

async function updateVariantPrice(variantId, price) {

  return await shopifyRequest(
    `variants/${variantId}.json`,
    "PUT",
    {
      variant: {
        id: variantId,
        price: price.toFixed(2)
      }
    }
  );
}


/* =========================================
   MAIN PRICE UPDATE SYSTEM
========================================= */

async function updateAllProductPrices() {

  if (!goldPrice || goldPrice <= 0) {
    throw new Error("Please enter valid Gold Price");
  }

  console.log("Starting price update...");
  console.log("Gold Price (10 Gram): ₹", goldPrice);

  // ભારતીય Gold Rate ને Per Gram માં convert
  const goldPricePerGram = goldPrice / 10;

  const products = await getAllProducts();

  let updatedProducts = 0;
  let updatedVariants = 0;

  for (const product of products) {

    try {

      const metafields = await getProductMetafields(product.id);

      // Gold Weight શોધો
      const goldWeightField = metafields.find(
        (m) =>
          m.key.toLowerCase().includes("gold_weight") ||
          m.key.toLowerCase().includes("goldweight")
      );

      // Making Charge શોધો
      const makingChargeField = metafields.find(
        (m) =>
          m.key.toLowerCase().includes("making_charge") ||
          m.key.toLowerCase().includes("makingcharge")
      );

      // જો Gold Weight નથી તો product skip
      if (!goldWeightField) {
        console.log(
          `Skipping ${product.title} - Gold Weight not found`
        );
        continue;
      }

      const goldWeight = Number(goldWeightField.value);

      // Making charge ન હોય તો 0
      const makingCharge = makingChargeField
        ? Number(makingChargeField.value)
        : 0;


      /* =========================================
         PRICE CALCULATION

         Gold Price Per Gram × Gold Weight
         + Making Charge
      ========================================= */

      const productPriceINR =
        goldPricePerGram * goldWeight +
        makingCharge;


      // INR ને USD માં convert
      const productPriceUSD =
        productPriceINR / USD_RATE;


      console.log("--------------------------------");
      console.log("Product:", product.title);
      console.log("Gold Weight:", goldWeight);
      console.log("Making Charge:", makingCharge);
      console.log("INR Price:", productPriceINR);
      console.log("USD Price:", productPriceUSD);


      // બધા variants ની price update
      for (const variant of product.variants) {

        await updateVariantPrice(
          variant.id,
          productPriceUSD
        );

        updatedVariants++;

        console.log(
          `Updated Variant ${variant.id} → $${productPriceUSD.toFixed(2)}`
        );
      }

      updatedProducts++;

    } catch (error) {

      console.log(
        `Error updating ${product.title}:`,
        error.message
      );

    }
  }

  return {
    success: true,
    updatedProducts,
    updatedVariants
  };
}


/* =========================================
   HOME PAGE
========================================= */

app.get("/", (req, res) => {

  res.send(`
<!DOCTYPE html>
<html>

<head>

<title>Gold Price Updater</title>

<style>

body {
  font-family: Arial, sans-serif;
  background: #f6f6f6;
  padding: 40px;
}

.container {
  max-width: 650px;
  margin: auto;
  background: white;
  padding: 30px;
  border-radius: 15px;
}

input {
  width: 100%;
  padding: 15px;
  font-size: 18px;
  box-sizing: border-box;
}

button {
  margin-top: 15px;
  padding: 15px 25px;
  background: #126b5d;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
}

.price-box {
  margin-top: 25px;
  padding: 20px;
  background: #e4f0e8;
  border-radius: 10px;
}

</style>

</head>

<body>

<div class="container">

<h1>💰 Gold Price Updater</h1>

<form action="/update-gold-price" method="POST">

<label>
<b>Today's Gold Price (10 Gram - INR)</b>
</label>

<br><br>

<input
type="number"
name="goldPrice"
value="${goldPrice}"
placeholder="Example: 75000"
required
>

<br>

<button type="submit">
Update Gold Price & All Products
</button>

</form>

<div class="price-box">

<b>Current Gold Price:</b>

<h2>
₹ ${goldPrice} / 10 Gram
</h2>

</div>

</div>

</body>

</html>
  `);

});


/* =========================================
   UPDATE GOLD PRICE
========================================= */

app.post("/update-gold-price", async (req, res) => {

  try {

    goldPrice = Number(req.body.goldPrice);

    if (!goldPrice || goldPrice <= 0) {
      return res.send("Invalid Gold Price");
    }

    console.log("New Gold Price:", goldPrice);

    const result =
      await updateAllProductPrices();

    res.send(`

      <h1>✅ Gold Price Updated Successfully!</h1>

      <h2>₹ ${goldPrice} / 10 Gram</h2>

      <p>
        Products Updated: ${result.updatedProducts}
      </p>

      <p>
        Variants Updated: ${result.updatedVariants}
      </p>

      <br>

      <a href="/">
        ← Go Back
      </a>

    `);

  } catch (error) {

    console.log(error);

    res.send(`

      <h1>❌ Error Updating Products</h1>

      <pre>${error.message}</pre>

      <a href="/">Go Back</a>

    `);

  }

});


/* =========================================
   SERVER START
========================================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Gold Price Updater running on port ${PORT}`);
});
