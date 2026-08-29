const express = require("express");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// =====================================================
// SETTINGS
// =====================================================

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// INR → USD conversion rate
// Render Environment Variables માં પણ મૂકી શકાય
const INR_TO_USD = Number(process.env.INR_TO_USD || 0.012);


// =====================================================
// CURRENT GOLD PRICE
// =====================================================

let goldPrice = Number(process.env.DEFAULT_GOLD_PRICE || 75000);


// =====================================================
// SHOPIFY HEADERS
// =====================================================

function shopifyHeaders() {
  return {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  };
}


// =====================================================
// NORMALIZE SHOPIFY STORE NAME
// =====================================================

function getStoreUrl() {

  if (!SHOPIFY_STORE) {
    return null;
  }

  let store = SHOPIFY_STORE
    .trim()
    .replace("https://", "")
    .replace("http://", "");

  return store;
}


// =====================================================
// GET NEXT PAGE URL FROM SHOPIFY LINK HEADER
// =====================================================

function getNextPageUrl(linkHeader) {

  if (!linkHeader) {
    return null;
  }

  const links = linkHeader.split(",");

  for (const link of links) {

    if (link.includes('rel="next"')) {

      const match = link.match(/<([^>]+)>/);

      if (match && match[1]) {
        return match[1];
      }

    }

  }

  return null;
}


// =====================================================
// GET ALL SHOPIFY PRODUCTS
// =====================================================

async function getAllProducts() {

  const store = getStoreUrl();

  let url =
    `https://${store}/admin/api/2025-01/products.json?limit=250`;

  let allProducts = [];

  while (url) {

    console.log("Fetching products page...");

    const response = await fetch(
      url,
      {
        headers: shopifyHeaders()
      }
    );

    if (!response.ok) {

      const errorText = await response.text();

      console.log("PRODUCT FETCH ERROR:");
      console.log(errorText);

      throw new Error(
        "Unable to fetch products from Shopify"
      );
    }

    const data = await response.json();

    const products = data.products || [];

    allProducts.push(...products);

    url = getNextPageUrl(
      response.headers.get("link")
    );
  }

  return allProducts;
}


// =====================================================
// GET PRODUCT METAFIELDS
// =====================================================

async function getProductMetafields(productId) {

  const store = getStoreUrl();

  let url =
    `https://${store}/admin/api/2025-01/products/${productId}/metafields.json?limit=250`;

  let allMetafields = [];

  while (url) {

    const response = await fetch(
      url,
      {
        headers: shopifyHeaders()
      }
    );

    if (!response.ok) {

      const errorText = await response.text();

      console.log(
        "METAFIELD ERROR:",
        productId,
        errorText
      );

      return [];
    }

    const data = await response.json();

    allMetafields.push(
      ...(data.metafields || [])
    );

    url = getNextPageUrl(
      response.headers.get("link")
    );
  }

  return allMetafields;
}


// =====================================================
// CLEAN NUMBER FROM METAFIELD
// Supports:
// 5
// 5.25
// "5.25"
// "5.25 g"
// =====================================================

function getNumber(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");

  const number = Number(cleaned);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return number;
}


// =====================================================
// FIND METAFIELD BY MANY POSSIBLE NAMES
// =====================================================

function findMetafield(
  metafields,
  possibleKeys
) {

  const normalizedKeys =
    possibleKeys.map(key =>
      key
        .toLowerCase()
        .replace(/[\s_-]/g, "")
    );

  return metafields.find(field => {

    const key =
      String(field.key || "")
        .toLowerCase()
        .replace(/[\s_-]/g, "");

    return normalizedKeys.includes(key);

  });

}


// =====================================================
// GET GOLD WEIGHT
//
// Supports many possible metafield names:
// gold_weight
// goldweight
// gold_weight_in_grams
// weight
// product_weight
// jewellery_weight
// jewelry_weight
// net_weight
// =====================================================

function getGoldWeight(metafields) {

  const field = findMetafield(
    metafields,
    [

      "gold_weight",

      "goldweight",

      "gold_weight_in_grams",

      "gold_weight_grams",

      "gold_grams",

      "goldgram",

      "gold_gram",

      "weight",

      "product_weight",

      "jewellery_weight",

      "jewelry_weight",

      "net_weight"

    ]
  );

  if (!field) {
    return 0;
  }

  return getNumber(field.value);
}


// =====================================================
// GET MAKING CHARGE
//
// Supports many possible names
// =====================================================

function getMakingCharge(metafields) {

  const field = findMetafield(
    metafields,
    [

      "making_charge",

      "makingcharge",

      "making_charges",

      "making",

      "labour_charge",

      "labor_charge",

      "manufacturing_charge"

    ]
  );

  if (!field) {
    return 0;
  }

  return getNumber(field.value);
}


// =====================================================
// CHECK WHETHER VARIANT IS GOLD
//
// This checks all variant option values.
// Example:
//
// Metal Type = Gold
// Jewelry Material = Gold
// Material = Gold
// =====================================================

function isGoldVariant(product, variant) {

  const goldWords = [

    "gold",

    "yellow gold",

    "white gold",

    "rose gold",

    "18k",

    "14k",

    "22k",

    "24k"

  ];


  const silverWords = [

    "silver",

    "sterling silver",

    "925 silver"

  ];


  const values = [

    variant.option1,

    variant.option2,

    variant.option3,

    variant.title

  ];


  let hasGold = false;


  for (const value of values) {

    if (!value) {
      continue;
    }

    const text =
      String(value).toLowerCase().trim();


    // Silver found = NEVER UPDATE
    for (const silverWord of silverWords) {

      if (text.includes(silverWord)) {
        return false;
      }

    }


    // Gold found
    for (const goldWord of goldWords) {

      if (text.includes(goldWord)) {
        hasGold = true;
      }

    }

  }


  return hasGold;
}


// =====================================================
// UPDATE SHOPIFY VARIANT PRICE
// =====================================================

async function updateVariantPrice(
  variantId,
  priceUSD
) {

  const store = getStoreUrl();

  const response = await fetch(

    `https://${store}/admin/api/2025-01/variants/${variantId}.json`,

    {

      method: "PUT",

      headers: shopifyHeaders(),

      body: JSON.stringify({

        variant: {

          id: variantId,

          price: Number(priceUSD).toFixed(2)

        }

      })

    }

  );


  if (!response.ok) {

    const errorText =
      await response.text();

    console.log(
      "VARIANT UPDATE ERROR:"
    );

    console.log(errorText);

    return false;
  }


  return true;
}


// =====================================================
// HOME PAGE
// =====================================================

app.get("/", (req, res) => {

  res.send(`

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width, initial-scale=1.0"
>

<title>Gold Price Updater</title>


<style>

* {
  box-sizing: border-box;
}


body {

  font-family:
    Arial,
    sans-serif;

  background:
    #f6f6f7;

  margin: 0;

  padding: 40px 20px;

}


.container {

  max-width: 700px;

  margin: auto;

  background: white;

  padding: 35px;

  border-radius: 12px;

  box-shadow:
    0 4px 20px
    rgba(0,0,0,0.08);

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

  border:
    1px solid #babfc3;

  border-radius: 8px;

  margin-bottom: 15px;

}


button {

  width: 100%;

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


</style>

</head>


<body>


<div class="container">


<h1>
💰 Gold Price Updater
</h1>


<div class="card">


<form
action="/update-gold-price"
method="POST"
>


<label>
Today's Gold Price (₹ Per Gram)
</label>


<input

type="number"

step="0.01"

name="goldPrice"

placeholder="Enter today's Gold price"

value="${goldPrice}"

required

>


<button type="submit">

Update All Gold Product Prices

</button>


</form>


</div>


<div class="price-box">


<b>
Current Gold Price:
</b>


<div class="price">

₹ ${goldPrice}

</div>


</div>


</div>


</body>

</html>

  `);

});


// =====================================================
// UPDATE ALL GOLD PRODUCTS
// =====================================================

app.post(
  "/update-gold-price",
  async (req, res) => {

    try {


      // ==============================================
      // VALIDATE GOLD PRICE
      // ==============================================

      const newGoldPrice =
        Number(req.body.goldPrice);


      if (
        !Number.isFinite(newGoldPrice) ||
        newGoldPrice <= 0
      ) {

        throw new Error(
          "Please enter a valid Gold Price"
        );

      }


      if (
        !SHOPIFY_STORE ||
        !SHOPIFY_ACCESS_TOKEN
      ) {

        throw new Error(
          "SHOPIFY_STORE or SHOPIFY_ACCESS_TOKEN is missing in Render Environment Variables"
        );

      }


      // Save new rate only after button click
      goldPrice = newGoldPrice;


      console.log(
        "========================================"
      );

      console.log(
        "NEW GOLD PRICE:",
        goldPrice
      );

      console.log(
        "INR TO USD:",
        INR_TO_USD
      );

      console.log(
        "========================================"
      );


      // ==============================================
      // GET ALL PRODUCTS
      // ==============================================

      const products =
        await getAllProducts();


      console.log(
        "TOTAL PRODUCTS FOUND:",
        products.length
      );


      let updatedProducts = 0;

      let updatedGoldVariants = 0;

      let silverVariantsNotChanged = 0;

      let productsWithoutGoldWeight = 0;

      let failedVariants = 0;


      // ==============================================
      // LOOP THROUGH EVERY PRODUCT
      // ==============================================

      for (const product of products) {


        console.log(
          "----------------------------------------"
        );

        console.log(
          "CHECKING PRODUCT:",
          product.title
        );


        // ============================================
        // GET PRODUCT METAFIELDS
        // ============================================

        const metafields =
          await getProductMetafields(
            product.id
          );


        // ============================================
        // GET GOLD WEIGHT
        // ============================================

        const goldWeight =
          getGoldWeight(
            metafields
          );


        // ============================================
        // GET MAKING CHARGE
        // ============================================

        const makingCharge =
          getMakingCharge(
            metafields
          );


        // ============================================
        // FIND GOLD VARIANTS FIRST
        // ============================================

        const goldVariants = [];

        const silverVariants = [];


        for (
          const variant
          of (product.variants || [])
        ) {


          if (
            isGoldVariant(
              product,
              variant
            )
          ) {

            goldVariants.push(
              variant
            );

          }

          else {

            silverVariants.push(
              variant
            );

          }

        }


        // ============================================
        // SILVER VARIANTS ARE NEVER UPDATED
        // ============================================

        silverVariantsNotChanged +=
          silverVariants.length;


        // ============================================
        // IF NO GOLD VARIANT, CONTINUE
        // ============================================

        if (
          goldVariants.length === 0
        ) {

          console.log(
            "NO GOLD VARIANTS:",
            product.title
          );

          continue;

        }


        // ============================================
        // IF GOLD PRODUCT HAS NO WEIGHT
        // ============================================

        if (
          !goldWeight ||
          goldWeight <= 0
        ) {

          console.log(
            "NO GOLD WEIGHT FOUND:",
            product.title
          );

          console.log(
            "AVAILABLE METAFIELDS:"
          );

          for (
            const field
            of metafields
          ) {

            console.log(
              field.namespace +
              "." +
              field.key +
              " = " +
              field.value
            );

          }


          productsWithoutGoldWeight++;

          continue;

        }


        // ============================================
        // CALCULATE NEW PRICE
        //
        // GOLD RATE × GOLD WEIGHT
        // + MAKING CHARGE
        // ============================================

        const priceINR =

          (
            goldPrice *
            goldWeight
          )

          +

          makingCharge;


        // ============================================
        // CONVERT INR TO USD
        // ============================================

        const priceUSD =

          priceINR *
          INR_TO_USD;


        const finalPrice =

          Number(
            priceUSD.toFixed(2)
          );


        console.log(
          "GOLD WEIGHT:",
          goldWeight
        );

        console.log(
          "MAKING CHARGE:",
          makingCharge
        );

        console.log(
          "PRICE INR:",
          priceINR
        );

        console.log(
          "FINAL PRICE USD:",
          finalPrice
        );


        // ============================================
        // UPDATE ONLY GOLD VARIANTS
        // ============================================

        let thisProductUpdated =
          false;


        for (
          const variant
          of goldVariants
        ) {


          console.log(
            "UPDATING GOLD VARIANT:",
            variant.title
          );


          const success =
            await updateVariantPrice(

              variant.id,

              finalPrice

            );


          if (success) {

            updatedGoldVariants++;

            thisProductUpdated =
              true;


            console.log(
              "SUCCESS:",
              variant.title
            );

          }

          else {

            failedVariants++;

          }

        }


        if (
          thisProductUpdated
        ) {

          updatedProducts++;

        }

      }


      // ==============================================
      // SUCCESS PAGE
      // ==============================================

      res.send(`

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width, initial-scale=1.0"
>

<title>Products Updated</title>


<style>

body {

  font-family:
    Arial,
    sans-serif;

  background:
    #f6f6f7;

  padding: 50px 20px;

  text-align: center;

}


.container {

  max-width: 650px;

  margin: auto;

  background: white;

  padding: 40px;

  border-radius: 12px;

  box-shadow:
    0 4px 20px
    rgba(0,0,0,0.08);

}


.success {

  color: #008060;

  font-size: 30px;

}


h2 {

  color: #202223;

}


p {

  font-size: 17px;

  line-height: 1.6;

}


.green {

  color: #008060;

  font-weight: bold;

}


.orange {

  color: #8a6116;

  font-weight: bold;

}


a {

  display: inline-block;

  margin-top: 25px;

  padding: 12px 25px;

  background: #008060;

  color: white;

  text-decoration: none;

  border-radius: 8px;

}


</style>

</head>


<body>


<div class="container">


<h1 class="success">

✅ Gold Prices Updated Successfully!

</h1>


<h2>

${updatedProducts} Products Updated

</h2>


<p>

Gold Variants Updated:

<strong class="green">

${updatedGoldVariants}

</strong>

</p>


<p>

Silver / Other Variants:

<strong>

${silverVariantsNotChanged}

NOT changed

</strong>

</p>


<p>

Products Without Gold Weight:

<strong class="orange">

${productsWithoutGoldWeight}

</strong>

</p>


<p>

Failed Variant Updates:

<strong>

${failedVariants}

</strong>

</p>


<p>

Today's Gold Price:

<strong>

₹ ${goldPrice}

</strong>

Per Gram

</p>


<p>

Currency:

<strong>

₹ INR automatically converted to $ USD

</strong>

</p>


<a href="/">

← Go Back

</a>


</div>


</body>

</html>

      `);


    }


    catch (error) {


      console.error(
        "========================================"
      );

      console.error(
        "ERROR UPDATING PRODUCTS:"
      );

      console.error(error);

      console.error(
        "========================================"
      );


      res.status(500).send(`

<!DOCTYPE html>

<html>

<body

style="

font-family:Arial;

background:#f6f6f7;

padding:50px;

text-align:center;

"

>


<h1>

❌ Error Updating Products

</h1>


<p>

${error.message}

</p>


<br>


<a href="/">

← Go Back

</a>


</body>

</html>

      `);

    }

  }
);


// =====================================================
// SERVER
// =====================================================

const PORT =
  process.env.PORT || 10000;


app.listen(
  PORT,
  () => {

    console.log(
      "Gold Price Updater running on port " +
      PORT
    );

  }
);
