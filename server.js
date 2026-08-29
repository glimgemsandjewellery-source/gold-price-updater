const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* =====================================================
   SHOPIFY CONFIGURATION
===================================================== */

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// તમારી Shopify store USD માં છે
const USD_CONVERSION_RATE = Number(
  process.env.INR_TO_USD_RATE || 83
);

/*
  શરૂઆતમાં Current Gold Price 0 જ રહેશે.
  Render restart થાય તો પણ 0 થી શરૂ થશે.
*/
let currentGoldPrice = 0;


/* =====================================================
   CHECK SHOPIFY SETTINGS
===================================================== */

function checkShopifyConfig() {
  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error(
      "SHOPIFY_STORE or SHOPIFY_ACCESS_TOKEN is missing in Render Environment Variables"
    );
  }
}


/* =====================================================
   SHOPIFY API
===================================================== */

function shopifyApi() {
  checkShopifyConfig();

  return axios.create({
    baseURL: `https://${SHOPIFY_STORE}/admin/api/2025-01`,
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      "Content-Type": "application/json"
    },
    timeout: 30000
  });
}


/* =====================================================
   CHECK IF VARIANT IS GOLD
===================================================== */

function isGoldVariant(variant) {

  if (!variant) return false;

  // બધા option values ને check કરશું
  const optionValues = [
    variant.option1,
    variant.option2,
    variant.option3
  ]
    .filter(Boolean)
    .map(value => String(value).toLowerCase().trim());

  // Silver હોય તો ક્યારેય update નહીં
  const hasSilver = optionValues.some(value =>
    value.includes("silver")
  );

  if (hasSilver) {
    return false;
  }

  // Gold શોધવું
  const hasGold = optionValues.some(value =>
    value.includes("gold")
  );

  return hasGold;
}


/* =====================================================
   GET ALL PRODUCTS FROM SHOPIFY
===================================================== */

async function getAllProducts() {

  const api = shopifyApi();

  let allProducts = [];
  let pageInfo = null;

  do {

    let url = "/products.json?limit=250";

    if (pageInfo) {
      url += `&page_info=${pageInfo}`;
    }

    const response = await api.get(url);

    const products = response.data.products || [];

    allProducts.push(...products);

    // Link header માં next page શોધવી
    const linkHeader = response.headers.link;

    pageInfo = null;

    if (linkHeader) {

      const links = linkHeader.split(",");

      for (const link of links) {

        if (link.includes('rel="next"')) {

          const match = link.match(/page_info=([^&>]+)/);

          if (match && match[1]) {
            pageInfo = match[1];
          }
        }
      }
    }

  } while (pageInfo);

  return allProducts;
}


/* =====================================================
   UPDATE GOLD VARIANT PRICE
===================================================== */

async function updateVariantPrice(variantId, priceUSD) {

  const api = shopifyApi();

  await api.put(
    `/variants/${variantId}.json`,
    {
      variant: {
        id: variantId,
        price: priceUSD.toFixed(2)
      }
    }
  );
}


/* =====================================================
   UPDATE ALL GOLD PRODUCTS
===================================================== */

async function updateAllGoldProducts(goldPriceINR) {

  const products = await getAllProducts();

  let productsUpdated = 0;
  let goldVariantsUpdated = 0;
  let silverVariantsSkipped = 0;
  let otherVariantsSkipped = 0;
  let errors = [];

  /*
    INR થી USD conversion

    Example:
    ₹75000 / 83 = $903.61
  */

  const goldPriceUSD =
    Number(goldPriceINR) / USD_CONVERSION_RATE;


  for (const product of products) {

    let productWasUpdated = false;

    const variants = product.variants || [];

    for (const variant of variants) {

      try {

        // માત્ર Gold variants
        if (isGoldVariant(variant)) {

          await updateVariantPrice(
            variant.id,
            goldPriceUSD
          );

          goldVariantsUpdated++;
          productWasUpdated = true;

        } else {

          const options = [
            variant.option1,
            variant.option2,
            variant.option3
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          if (options.includes("silver")) {
            silverVariantsSkipped++;
          } else {
            otherVariantsSkipped++;
          }
        }

      } catch (error) {

        console.error(
          `Error updating variant ${variant.id}:`,
          error.response?.data || error.message
        );

        errors.push({
          variantId: variant.id,
          error:
            error.response?.data?.errors ||
            error.message
        });
      }
    }

    if (productWasUpdated) {
      productsUpdated++;
    }
  }

  return {
    totalProducts: products.length,
    productsUpdated,
    goldVariantsUpdated,
    silverVariantsSkipped,
    otherVariantsSkipped,
    goldPriceINR,
    goldPriceUSD,
    errors
  };
}


/* =====================================================
   HOME PAGE
===================================================== */

app.get("/", (req, res) => {

  res.send(`
<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>Gold Price Updater</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;

  font-family: Arial, sans-serif;

  background: #f4f5f7;

  display: flex;
  justify-content: center;
  align-items: flex-start;

  padding-top: 80px;

  color: #1f2937;
}

.container {

  width: 100%;
  max-width: 700px;

  background: white;

  padding: 35px;

  border-radius: 16px;

  box-shadow:
    0 10px 35px
    rgba(0,0,0,0.08);
}

h1 {

  margin-top: 0;

  font-size: 34px;

  display: flex;
  align-items: center;

  gap: 12px;
}

.form-box {

  background: #f1f3f5;

  padding: 25px;

  border-radius: 14px;

  margin-top: 25px;
}

label {

  display: block;

  font-size: 17px;

  font-weight: bold;

  margin-bottom: 12px;
}

input {

  width: 100%;

  padding: 18px;

  border-radius: 10px;

  border: 1px solid #b8c0c8;

  font-size: 18px;
}

button {

  width: 100%;

  margin-top: 15px;

  padding: 17px;

  border: none;

  border-radius: 8px;

  background: #147d67;

  color: white;

  font-size: 17px;

  cursor: pointer;
}

button:hover {
  background: #106b59;
}

.current-box {

  margin-top: 25px;

  padding: 22px;

  border-radius: 14px;

  background:
    linear-gradient(
      90deg,
      #e5eee2,
      #d8e4d3
    );
}

.current-title {

  font-weight: bold;

  font-size: 17px;
}

.current-price {

  margin-top: 8px;

  font-size: 30px;

  font-weight: bold;

  color: #176653;
}

.info {

  margin-top: 20px;

  color: #666;

  font-size: 14px;
}

</style>

</head>

<body>

<div class="container">

<h1>
💰 Gold Price Updater
</h1>


<form
action="/update-gold-price"
method="POST"
class="form-box"
>

<label>
Today's Gold Price (₹ Per Gram)
</label>

<input
type="number"
name="goldPrice"
step="0.01"
min="0"
placeholder="Enter today's Gold price"
required
>

<button type="submit">

Update All Gold Product Prices

</button>

</form>


<div class="current-box">

<div class="current-title">

Current Gold Price:

</div>

<div class="current-price">

₹ ${currentGoldPrice.toFixed(2)}

</div>

</div>


<div class="info">

Only Gold variants will be updated. Silver variants will remain unchanged.

</div>

</div>

</body>

</html>
  `);
});


/* =====================================================
   UPDATE GOLD PRICE ROUTE
===================================================== */

app.post("/update-gold-price", async (req, res) => {

  try {

    const goldPrice = Number(req.body.goldPrice);

    if (
      !goldPrice ||
      goldPrice <= 0
    ) {

      return res.status(400).send(`
        <h2>Invalid Gold Price</h2>
        <p>Please enter a valid Gold price.</p>
        <a href="/">← Go Back</a>
      `);
    }


    // બધા products update કરો
    const result =
      await updateAllGoldProducts(goldPrice);


    // સફળ થયા પછી current price update
    currentGoldPrice = goldPrice;


    res.send(`

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>Products Updated</title>

<style>

body {

  margin: 0;

  min-height: 100vh;

  display: flex;

  justify-content: center;

  align-items: center;

  font-family: Arial, sans-serif;

  background: #f4f5f7;

  color: #1f2937;
}

.card {

  width: 100%;

  max-width: 650px;

  background: white;

  padding: 45px;

  border-radius: 16px;

  text-align: center;

  box-shadow:
    0 10px 35px
    rgba(0,0,0,0.08);
}

h1 {

  color: #176653;
}

.big {

  font-size: 25px;

  font-weight: bold;

  margin: 20px 0;
}

.stats {

  margin-top: 25px;

  line-height: 2;

  font-size: 17px;
}

.success {

  color: #176653;

  font-weight: bold;
}

.back {

  display: inline-block;

  margin-top: 30px;

  padding: 14px 25px;

  background: #147d67;

  color: white;

  text-decoration: none;

  border-radius: 8px;
}

</style>

</head>


<body>

<div class="card">

<h1>
✅ Gold Prices Updated Successfully!
</h1>


<div class="big">

${result.productsUpdated} Products Updated

</div>


<div class="stats">

<b>Total Products Checked:</b>
${result.totalProducts}

<br>

<b>Gold Variants Updated:</b>
<span class="success">
${result.goldVariantsUpdated}
</span>

<br>

<b>Silver Variants NOT Changed:</b>
${result.silverVariantsSkipped}

<br>

<b>Other Variants Skipped:</b>
${result.otherVariantsSkipped}

<br><br>

<b>Today's Gold Price:</b>

₹ ${result.goldPriceINR.toFixed(2)}

<br>

<b>Gold Price Applied in Shopify:</b>

$ ${result.goldPriceUSD.toFixed(2)}

</div>


${
result.errors.length > 0
? `
<br>
<b>
Errors:
${result.errors.length}
</b>
`
: ""
}


<a
href="/"
class="back"
>

← Go Back

</a>

</div>

</body>

</html>

    `);

  } catch (error) {

    console.error(
      "UPDATE ERROR:",
      error.response?.data ||
      error.message
    );


    res.status(500).send(`

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>Error Updating Products</title>

</head>

<body

style="
font-family:Arial;
text-align:center;
padding:80px;
background:#f4f5f7;
">

<h1>
❌ Error Updating Products
</h1>

<p>

${error.message}

</p>

<p>

Make sure SHOPIFY_STORE and
SHOPIFY_ACCESS_TOKEN are correctly added in Render Environment Variables.

</p>

<a href="/">
← Go Back
</a>

</body>

</html>

    `);
  }

});


/* =====================================================
   SERVER
===================================================== */

const PORT =
  process.env.PORT || 10000;


app.listen(PORT, () => {

  console.log(
    `Gold Price Updater running on port ${PORT}`
  );

});
