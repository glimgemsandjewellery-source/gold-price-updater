const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

const SHOP = (
  process.env.SHOPIFY_SHOP ||
  process.env.SHOPIFY_STORE ||
  process.env.SHOPIFY_STORE_DOMAIN ||
  ""
)
  .replace("https://", "")
  .replace("http://", "")
  .replace(".myshopify.com", "")
  .trim();

const ACCESS_TOKEN =
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
  process.env.SHOPIFY_ACCESS_TOKEN ||
  "";

const INR_TO_USD = Number(process.env.INR_TO_USD || 0.012);

if (!SHOP) {
  console.error("❌ SHOPIFY_SHOP / SHOPIFY_STORE is missing");
}

if (!ACCESS_TOKEN) {
  console.error("❌ SHOPIFY_ADMIN_ACCESS_TOKEN is missing");
}


/* =========================================================
   SAVE LAST GOLD RATE
========================================================= */

const DATA_FILE = path.join(__dirname, "gold-rate-data.json");

function getSavedData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (error) {
    console.log("Could not read saved gold rate:", error.message);
  }

  return {
    lastGoldRateINR: null,
    lastUpdatedAt: null,
  };
}

function saveData(data) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}


/* =========================================================
   SHOPIFY GRAPHQL
========================================================= */

async function shopifyGraphQL(query, variables = {}) {
  const url = `https://${SHOP}.myshopify.com/admin/api/2026-07/graphql.json`;

  const response = await axios.post(
    url,
    {
      query,
      variables,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ACCESS_TOKEN,
      },
    }
  );

  if (response.data.errors) {
    throw new Error(
      response.data.errors
        .map((error) => error.message)
        .join(", ")
    );
  }

  return response.data.data;
}


/* =========================================================
   CHECK IF VARIANT IS GOLD
========================================================= */

function isGoldVariant(variant, product) {
  const textParts = [];

  if (variant.title) {
    textParts.push(variant.title);
  }

  if (variant.displayName) {
    textParts.push(variant.displayName);
  }

  if (product.title) {
    textParts.push(product.title);
  }

  if (variant.selectedOptions) {
    variant.selectedOptions.forEach((option) => {
      if (option.name) {
        textParts.push(option.name);
      }

      if (option.value) {
        textParts.push(option.value);
      }
    });
  }

  const text = textParts
    .join(" ")
    .toLowerCase();

  /*
    GOLD શોધવા માટે:
    Gold
    18K Gold
    14K Gold
    White Gold
    Rose Gold
    Yellow Gold
  */

  const goldWords = [
    "gold",
    "18k",
    "14k",
    "12k",
    "10k",
    "9k",
    "white gold",
    "rose gold",
    "yellow gold",
  ];

  return goldWords.some((word) => text.includes(word));
}


/* =========================================================
   CHECK IF VARIANT IS SILVER
========================================================= */

function isSilverVariant(variant, product) {
  const textParts = [];

  if (variant.title) {
    textParts.push(variant.title);
  }

  if (variant.displayName) {
    textParts.push(variant.displayName);
  }

  if (product.title) {
    textParts.push(product.title);
  }

  if (variant.selectedOptions) {
    variant.selectedOptions.forEach((option) => {
      if (option.name) {
        textParts.push(option.name);
      }

      if (option.value) {
        textParts.push(option.value);
      }
    });
  }

  const text = textParts
    .join(" ")
    .toLowerCase();

  return text.includes("silver");
}


/* =========================================================
   GET ALL PRODUCTS
========================================================= */

async function getAllProducts() {
  let allProducts = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const query = `
      query GetProducts($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }

          edges {
            node {
              id
              title

              variants(first: 250) {
                edges {
                  node {
                    id
                    title
                    displayName
                    price

                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const data = await shopifyGraphQL(query, {
      cursor,
    });

    const products = data.products;

    products.edges.forEach((edge) => {
      allProducts.push(edge.node);
    });

    hasNextPage = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;
  }

  return allProducts;
}


/* =========================================================
   UPDATE VARIANT PRICE
========================================================= */

async function updateVariantPrice(variantId, newPrice) {
  const mutation = `
    mutation UpdateVariantPrice(
      $input: ProductVariantInput!
    ) {
      productVariantUpdate(input: $input) {
        productVariant {
          id
          price
        }

        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(mutation, {
    input: {
      id: variantId,
      price: newPrice.toFixed(2),
    },
  });

  const errors =
    data.productVariantUpdate.userErrors;

  if (errors && errors.length > 0) {
    throw new Error(
      errors
        .map((error) => error.message)
        .join(", ")
    );
  }

  return data.productVariantUpdate.productVariant;
}


/* =========================================================
   HOME PAGE
========================================================= */

app.get("/", (req, res) => {
  const savedData = getSavedData();

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
          margin: 0;
          font-family: Arial, sans-serif;
          background: #f5f5f5;
          color: #222;
        }

        .container {
          width: 100%;
          max-width: 600px;
          margin: 80px auto;
          background: white;
          padding: 40px;
          border-radius: 15px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }

        h1 {
          text-align: center;
          color: #176b5b;
        }

        .info {
          background: #f1f7f5;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 25px;
          line-height: 1.8;
        }

        label {
          display: block;
          font-weight: bold;
          margin-bottom: 8px;
        }

        input {
          width: 100%;
          padding: 15px;
          font-size: 18px;
          border: 1px solid #ccc;
          border-radius: 8px;
        }

        button {
          width: 100%;
          margin-top: 20px;
          padding: 15px;
          font-size: 18px;
          background: #176b5b;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }

        button:hover {
          background: #125447;
        }

        .note {
          margin-top: 20px;
          font-size: 14px;
          color: #666;
          text-align: center;
        }
      </style>

    </head>

    <body>

      <div class="container">

        <h1>💰 Gold Price Updater</h1>

        <div class="info">

          <strong>Last Gold Rate:</strong>

          ${
            savedData.lastGoldRateINR
              ? `₹ ${savedData.lastGoldRateINR}`
              : "Not set yet"
          }

          <br>

          <strong>Currency:</strong>
          INR → USD

          <br>

          <strong>Silver:</strong>
          Will NOT be changed

        </div>

        <form method="POST" action="/update-gold-price">

          <label>
            Enter Today's Gold Price (₹ INR)
          </label>

          <input
            type="number"
            name="goldPrice"
            placeholder="Example: 75000"
            required
            step="0.01"
          >

          <button type="submit">
            Update All Gold Products
          </button>

        </form>

        <div class="note">

          Only variants containing Gold will be updated.
          Silver and other variants will remain unchanged.

        </div>

      </div>

    </body>
    </html>
  `);
});


/* =========================================================
   UPDATE ALL GOLD PRODUCTS
========================================================= */

app.post("/update-gold-price", async (req, res) => {
  try {

    const newGoldRateINR = Number(req.body.goldPrice);

    if (
      !newGoldRateINR ||
      newGoldRateINR <= 0
    ) {
      return res.send(`
        <h1>❌ Invalid Gold Price</h1>
        <p>Please enter a valid Gold Price.</p>
        <a href="/">← Go Back</a>
      `);
    }


    /* -----------------------------------------------
       GET PREVIOUS GOLD RATE
    ----------------------------------------------- */

    const savedData = getSavedData();

    const oldGoldRateINR =
      savedData.lastGoldRateINR;


    /*
      IMPORTANT:

      પ્રથમ વખત Gold Rate નાખવામાં આવે ત્યારે
      old rate ન હોય.

      એટલે પ્રથમ વખત ratio calculation
      માટે new rate ને baseline તરીકે save કરીશું.

      ત્યારબાદ next update વખતે
      બધા Gold prices proportionally update થશે.
    */

    if (!oldGoldRateINR) {

      saveData({
        lastGoldRateINR: newGoldRateINR,
        lastUpdatedAt: new Date().toISOString(),
      });

      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>

          <title>Gold Rate Saved</title>

          <style>

            body {
              font-family: Arial;
              background: #f5f5f5;
              text-align: center;
              padding-top: 100px;
            }

            .box {
              background: white;
              max-width: 650px;
              margin: auto;
              padding: 40px;
              border-radius: 15px;
              box-shadow: 0 10px 30px rgba(0,0,0,.1);
            }

            h1 {
              color: #176b5b;
            }

            a {
              display: inline-block;
              margin-top: 25px;
              background: #176b5b;
              color: white;
              padding: 12px 25px;
              text-decoration: none;
              border-radius: 7px;
            }

          </style>

        </head>

        <body>

          <div class="box">

            <h1>✅ Gold Rate Saved Successfully!</h1>

            <h2>₹ ${newGoldRateINR}</h2>

            <p>
              This is now your baseline Gold Rate.
            </p>

            <p>
              Enter a new Gold Rate next time and
              all Gold variants will update.
            </p>

            <p>
              Silver prices will never change.
            </p>

            <a href="/">← Go Back</a>

          </div>

        </body>
        </html>
      `);
    }


    /* -----------------------------------------------
       SAME RATE = DON'T CHANGE ANYTHING
    ----------------------------------------------- */

    if (newGoldRateINR === oldGoldRateINR) {

      return res.send(`
        <h1>ℹ️ Same Gold Price</h1>

        <p>
          The Gold Rate ₹ ${newGoldRateINR}
          is already saved.
        </p>

        <p>
          No product prices were changed.
        </p>

        <br>

        <a href="/">← Go Back</a>
      `);
    }


    /* -----------------------------------------------
       CALCULATE RATIO
    ----------------------------------------------- */

    const priceMultiplier =
      newGoldRateINR / oldGoldRateINR;


    console.log("=================================");
    console.log("OLD GOLD RATE:", oldGoldRateINR);
    console.log("NEW GOLD RATE:", newGoldRateINR);
    console.log("MULTIPLIER:", priceMultiplier);
    console.log("=================================");


    /* -----------------------------------------------
       GET ALL PRODUCTS
    ----------------------------------------------- */

    const products =
      await getAllProducts();

    console.log(
      `Total products found: ${products.length}`
    );


    let productsUpdated = new Set();

    let goldVariantsUpdated = 0;

    let silverVariantsSkipped = 0;

    let otherVariantsSkipped = 0;


    /* -----------------------------------------------
       LOOP THROUGH ALL PRODUCTS
    ----------------------------------------------- */

    for (const product of products) {

      const variants =
        product.variants.edges.map(
          (edge) => edge.node
        );


      for (const variant of variants) {

        /*
          FIRST CHECK SILVER

          Silver will NEVER be updated
        */

        if (isSilverVariant(variant, product)) {

          silverVariantsSkipped++;

          continue;
        }


        /*
          CHECK GOLD
        */

        if (!isGoldVariant(variant, product)) {

          otherVariantsSkipped++;

          continue;
        }


        /*
          CURRENT SHOPIFY PRICE
        */

        const currentPrice =
          Number(variant.price);


        if (
          !currentPrice ||
          currentPrice <= 0
        ) {
          console.log(
            "Skipping invalid price:",
            variant.id
          );

          continue;
        }


        /*
          NEW PRICE

          Existing USD price × Gold Rate ratio

          Example:

          Old Gold Rate = ₹75,000
          New Gold Rate = ₹80,000

          Product = $100

          New Price =
          $100 × (80000 / 75000)
        */

        const newPrice =
          currentPrice * priceMultiplier;


        console.log(
          `Updating GOLD variant:
          ${variant.title}
          ${currentPrice}
          →
          ${newPrice.toFixed(2)}`
        );


        /*
          UPDATE SHOPIFY
        */

        await updateVariantPrice(
          variant.id,
          newPrice
        );


        goldVariantsUpdated++;

        productsUpdated.add(product.id);
      }
    }


    /* -----------------------------------------------
       SAVE NEW GOLD RATE
    ----------------------------------------------- */

    saveData({
      lastGoldRateINR: newGoldRateINR,
      lastUpdatedAt: new Date().toISOString(),
    });


    /* -----------------------------------------------
       SUCCESS PAGE
    ----------------------------------------------- */

    res.send(`
      <!DOCTYPE html>

      <html>

      <head>

        <title>Products Updated</title>

        <style>

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #f5f5f5;
          }

          .container {
            width: 100%;
            max-width: 700px;
            margin: 80px auto;
            background: white;
            padding: 45px;
            border-radius: 15px;
            box-shadow:
              0 10px 35px
              rgba(0,0,0,0.12);

            text-align: center;
          }

          h1 {
            color: #176b5b;
          }

          h2 {
            margin-top: 25px;
          }

          .success {
            color: #176b5b;
            font-weight: bold;
          }

          .stats {
            margin: 30px 0;
            line-height: 2;
            font-size: 17px;
          }

          hr {
            border: none;
            border-top: 1px solid #ddd;
            margin: 25px 0;
          }

          .back {
            display: inline-block;
            background: #176b5b;
            color: white;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 8px;
          }

        </style>

      </head>


      <body>

        <div class="container">

          <h1>
            ✅ Gold Prices Updated Successfully!
          </h1>


          <h2>
            ${productsUpdated.size}
            Products Updated
          </h2>


          <div class="stats">

            <strong>
              Gold Variants Updated:
            </strong>

            ${goldVariantsUpdated}

            <br>


            <strong>
              Silver Variants:
            </strong>

            ${silverVariantsSkipped}
            <span class="success">
              NOT changed
            </span>

            <br>


            <strong>
              Other Variants:
            </strong>

            ${otherVariantsSkipped}
            NOT changed

            <br><br>


            <strong>
              Old Gold Price:
            </strong>

            ₹ ${oldGoldRateINR}

            <br>


            <strong>
              Today's Gold Price:
            </strong>

            ₹ ${newGoldRateINR}

            <br><br>


            <strong>
              Currency:
            </strong>

            Product prices remain in
            <strong>$ USD</strong>

          </div>


          <hr>


          <p class="success">

            ✓ Only Gold variants were updated.

          </p>


          <p class="success">

            ✓ Silver prices remain exactly unchanged.

          </p>


          <p>

            Prices will not change again until
            a new Gold Rate is entered and Update
            is clicked.

          </p>


          <br>


          <a
            class="back"
            href="/"
          >
            ← Go Back
          </a>


        </div>

      </body>

      </html>
    `);


  } catch (error) {

    console.error(
      "ERROR UPDATING PRODUCTS:",
      error.response?.data || error.message
    );


    res.status(500).send(`
      <!DOCTYPE html>

      <html>

      <head>

        <title>Error Updating Products</title>

        <style>

          body {
            font-family: Arial;
            background: #f5f5f5;
            text-align: center;
            padding-top: 100px;
          }

          .box {
            max-width: 700px;
            background: white;
            padding: 40px;
            margin: auto;
            border-radius: 15px;
            box-shadow:
              0 10px 30px
              rgba(0,0,0,.1);
          }

          h1 {
            color: #c0392b;
          }

        </style>

      </head>

      <body>

        <div class="box">

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

        </div>

      </body>

      </html>
    `);
  }
});


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/health", (req, res) => {

  res.json({
    status: "OK",
    message: "Gold Price Updater is running",
  });

});


/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, () => {

  console.log(
    `🚀 Server running on port ${PORT}`
  );

});
