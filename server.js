require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===============================
// SHOPIFY SETTINGS
// ===============================

const SHOP =
  process.env.SHOPIFY_SHOP ||
  process.env.SHOPIFY_STORE;

const ACCESS_TOKEN =
  process.env.SHOPIFY_ACCESS_TOKEN ||
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

const API_VERSION = "2025-01";

// પ્રથમ વખત માટે તમારો છેલ્લો Gold Rate
// જો Render Environment માં LAST_GOLD_PRICE હોય તો એ use થશે
const DEFAULT_GOLD_PRICE = Number(
  process.env.LAST_GOLD_PRICE || 75000
);

// ===============================
// CHECK SETTINGS
// ===============================

if (!SHOP || !ACCESS_TOKEN) {
  console.error("❌ Missing Shopify SHOP or ACCESS TOKEN");
}

// ===============================
// SHOPIFY GRAPHQL
// ===============================

async function shopifyGraphQL(query, variables = {}) {
  const url = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

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
    console.error(response.data.errors);
    throw new Error(JSON.stringify(response.data.errors));
  }

  return response.data.data;
}

// ===============================
// GET SAVED GOLD PRICE
// ===============================

async function getSavedGoldPrice() {
  try {
    const query = `
      query {
        shop {
          id
          metafield(
            namespace: "gold_price_updater"
            key: "last_gold_price"
          ) {
            id
            value
          }
        }
      }
    `;

    const data = await shopifyGraphQL(query);

    const shop = data.shop;

    if (
      shop.metafield &&
      shop.metafield.value &&
      !isNaN(Number(shop.metafield.value))
    ) {
      return Number(shop.metafield.value);
    }

    return DEFAULT_GOLD_PRICE;
  } catch (error) {
    console.error("Error getting saved price:", error.message);
    return DEFAULT_GOLD_PRICE;
  }
}

// ===============================
// SAVE GOLD PRICE
// ===============================

async function saveGoldPrice(price) {
  const query = `
    query {
      shop {
        id
      }
    }
  `;

  const shopData = await shopifyGraphQL(query);

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    metafields: [
      {
        ownerId: shopData.shop.id,
        namespace: "gold_price_updater",
        key: "last_gold_price",
        type: "number_decimal",
        value: String(price),
      },
    ],
  };

  const result = await shopifyGraphQL(mutation, variables);

  if (result.metafieldsSet.userErrors.length > 0) {
    console.error(result.metafieldsSet.userErrors);
  }
}

// ===============================
// CHECK IF VARIANT IS GOLD
// ===============================

function isGoldVariant(variant) {
  // બધા selected options check કરશે
  if (variant.selectedOptions) {
    for (const option of variant.selectedOptions) {
      const value = String(option.value || "").toLowerCase();

      // Gold, White Gold, Rose Gold, Yellow Gold વગેરે
      if (value.includes("gold")) {
        return true;
      }
    }
  }

  // Backup માટે variant title પણ check
  const title = String(variant.title || "").toLowerCase();

  if (title.includes("gold")) {
    return true;
  }

  return false;
}

// ===============================
// GET ALL PRODUCTS
// ===============================

async function getAllProducts() {
  let products = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const query = `
      query getProducts($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }

          nodes {
            id
            title

            variants(first: 250) {
              nodes {
                id
                title
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
    `;

    const data = await shopifyGraphQL(query, {
      cursor,
    });

    products = products.concat(data.products.nodes);

    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }

  return products;
}

// ===============================
// UPDATE PRODUCT VARIANTS
// ===============================

async function updateProductVariants(productId, variants) {
  const mutation = `
    mutation productVariantsBulkUpdate(
      $productId: ID!
      $variants: [ProductVariantsBulkInput!]!
    ) {
      productVariantsBulkUpdate(
        productId: $productId
        variants: $variants
      ) {
        product {
          id
        }

        productVariants {
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

  const variables = {
    productId,
    variants,
  };

  const result = await shopifyGraphQL(mutation, variables);

  const errors =
    result.productVariantsBulkUpdate.userErrors;

  if (errors && errors.length > 0) {
    console.error(
      "Shopify Update Error:",
      JSON.stringify(errors)
    );

    throw new Error(
      errors.map((e) => e.message).join(", ")
    );
  }

  return result;
}

// ===============================
// HOME PAGE
// IMPORTANT BOX REMOVED
// ===============================

app.get("/", async (req, res) => {
  try {
    const lastGoldPrice = await getSavedGoldPrice();

    res.send(`
      <!DOCTYPE html>
      <html lang="en">

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
            margin: 0;
            min-height: 100vh;

            font-family:
              Arial,
              Helvetica,
              sans-serif;

            background:
              linear-gradient(
                135deg,
                #f4f5f7,
                #e9ebef
              );

            display: flex;
            align-items: center;
            justify-content: center;

            padding: 30px;
          }

          .container {
            width: 100%;
            max-width: 700px;

            background: white;

            border-radius: 18px;

            padding: 42px;

            box-shadow:
              0 15px 45px
              rgba(0,0,0,0.12);
          }

          h1 {
            margin: 0 0 30px;

            font-size: 36px;

            color: #263547;

            text-align: center;
          }

          .form-box {
            background: #f5f6f8;

            padding: 28px;

            border-radius: 14px;
          }

          label {
            display: block;

            font-size: 18px;

            font-weight: bold;

            margin-bottom: 12px;

            color: #263547;
          }

          input {
            width: 100%;

            padding: 17px;

            border:
              1px solid #c8ced6;

            border-radius: 10px;

            font-size: 20px;

            outline: none;
          }

          input:focus {
            border-color: #157a63;
          }

          button {
            width: 100%;

            margin-top: 16px;

            padding: 17px;

            border: none;

            border-radius: 10px;

            background: #147a63;

            color: white;

            font-size: 18px;

            font-weight: bold;

            cursor: pointer;

            transition: 0.2s;
          }

          button:hover {
            background: #0f654f;
          }

          .last-price {
            margin-top: 25px;

            padding: 22px;

            background:
              linear-gradient(
                135deg,
                #edf7f1,
                #dceee2
              );

            border-radius: 14px;

            color: #263547;
          }

          .last-price h3 {
            margin: 0 0 10px;

            font-size: 18px;
          }

          .price {
            font-size: 32px;

            font-weight: bold;

            color: #147a63;
          }

          .note {
            margin-top: 25px;

            text-align: center;

            color: #666;

            font-size: 15px;
          }

        </style>
      </head>

      <body>

        <div class="container">

          <h1>
            🪙 Gold Price Updater
          </h1>

          <div class="form-box">

            <form
              action="/update-gold-price"
              method="POST"
            >

              <label>
                Today's Gold Price (₹)
              </label>

              <input
                type="number"
                name="goldPrice"
                value="${lastGoldPrice}"
                required
                min="1"
                step="0.01"
              >

              <button type="submit">
                Update All Gold Product Prices
              </button>

            </form>

          </div>

          <div class="last-price">

            <h3>
              Last Entered Gold Price:
            </h3>

            <div class="price">
              ₹ ${lastGoldPrice}
            </div>

          </div>

          <div class="note">
            Only Gold variants are updated. Silver and other variants remain unchanged.
          </div>

        </div>

      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`
      <h2>Error</h2>
      <p>${error.message}</p>
    `);
  }
});

// ===============================
// UPDATE ALL GOLD PRODUCTS
// ===============================

app.post("/update-gold-price", async (req, res) => {
  try {
    const newGoldPrice = Number(req.body.goldPrice);

    if (
      !newGoldPrice ||
      isNaN(newGoldPrice) ||
      newGoldPrice <= 0
    ) {
      return res.status(400).send(`
        <h2>❌ Invalid Gold Price</h2>
        <p>Please enter a valid Gold price.</p>
        <a href="/">← Go Back</a>
      `);
    }

    // છેલ્લો Gold Rate
    const oldGoldPrice =
      await getSavedGoldPrice();

    // જો same price હોય તો price ફરીથી નહીં બદલાય
    if (newGoldPrice === oldGoldPrice) {
      return res.send(`
        <!DOCTYPE html>

        <html>
        <head>

          <title>No Changes Needed</title>

          <style>

            body {
              font-family: Arial;
              background: #f4f5f7;
              text-align: center;
              padding: 80px;
            }

            .box {
              background: white;
              max-width: 650px;
              margin: auto;
              padding: 40px;
              border-radius: 18px;
              box-shadow:
                0 10px 30px
                rgba(0,0,0,0.1);
            }

            a {
              display: inline-block;
              margin-top: 25px;
              padding: 14px 25px;
              background: #147a63;
              color: white;
              text-decoration: none;
              border-radius: 8px;
            }

          </style>

        </head>

        <body>

          <div class="box">

            <h1>✓ Gold Price Already Updated</h1>

            <h2>
              ₹ ${newGoldPrice}
            </h2>

            <p>
              The same Gold price is already saved, so no product prices were changed.
            </p>

            <a href="/">
              ← Go Back
            </a>

          </div>

        </body>
        </html>
      `);
    }

    // ===================================
    // RATIO CALCULATION
    // ===================================

    const ratio =
      newGoldPrice / oldGoldPrice;

    console.log("Old Gold Price:", oldGoldPrice);
    console.log("New Gold Price:", newGoldPrice);
    console.log("Ratio:", ratio);

    // ===================================
    // GET ALL SHOPIFY PRODUCTS
    // ===================================

    const products =
      await getAllProducts();

    console.log(
      "Total Products Found:",
      products.length
    );

    let updatedProducts = 0;
    let updatedVariants = 0;
    let silverOtherVariants = 0;

    // ===================================
    // LOOP THROUGH ALL PRODUCTS
    // ===================================

    for (const product of products) {
      const variantsToUpdate = [];

      for (const variant of product.variants.nodes) {

        // ONLY GOLD VARIANTS
        if (isGoldVariant(variant)) {

          const currentPrice =
            Number(variant.price);

          // Invalid price હોય તો skip
          if (
            !currentPrice ||
            isNaN(currentPrice) ||
            currentPrice <= 0
          ) {
            console.log(
              "Skipping invalid price:",
              product.title,
              variant.title
            );

            continue;
          }

          // =================================
          // NEW USD PRICE
          // =================================

          const newPrice =
            currentPrice * ratio;

          // 2 decimal સુધી રાખવું
          const finalPrice =
            Math.max(0.01, newPrice)
              .toFixed(2);

          variantsToUpdate.push({
            id: variant.id,
            price: finalPrice,
          });

          updatedVariants++;

        } else {

          // SILVER / OTHER
          // બિલકુલ change નહીં થાય
          silverOtherVariants++;

        }
      }

      // ===================================
      // UPDATE THIS PRODUCT'S GOLD VARIANTS
      // ===================================

      if (variantsToUpdate.length > 0) {

        try {

          await updateProductVariants(
            product.id,
            variantsToUpdate
          );

          updatedProducts++;

          console.log(
            `✓ Updated: ${product.title}`
          );

        } catch (productError) {

          console.error(
            `❌ Error updating ${product.title}:`,
            productError.message
          );

          // એક product fail થાય
          // તો પણ બીજા products ચાલુ રહેશે
        }
      }
    }

    // ===================================
    // SAVE NEW GOLD PRICE
    // ===================================

    await saveGoldPrice(newGoldPrice);

    // ===================================
    // SUCCESS PAGE
    // ===================================

    res.send(`
      <!DOCTYPE html>

      <html lang="en">

      <head>

        <meta charset="UTF-8">

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        >

        <title>Products Updated</title>

        <style>

          body {
            margin: 0;

            min-height: 100vh;

            font-family:
              Arial,
              Helvetica,
              sans-serif;

            background:
              linear-gradient(
                135deg,
                #f4f5f7,
                #e9ebef
              );

            display: flex;

            align-items: center;

            justify-content: center;

            padding: 30px;
          }

          .box {
            width: 100%;
            max-width: 700px;

            background: white;

            border-radius: 18px;

            padding: 45px;

            text-align: center;

            box-shadow:
              0 15px 45px
              rgba(0,0,0,0.12);
          }

          h1 {
            color: #147a63;

            margin-top: 0;

            font-size: 32px;
          }

          h2 {
            color: #263547;
          }

          .stat {
            font-size: 18px;

            margin: 18px 0;

            color: #263547;
          }

          .number {
            font-weight: bold;

            color: #147a63;
          }

          .gold-price {
            margin: 25px 0;

            padding: 20px;

            border-radius: 12px;

            background: #edf7f1;

            font-size: 20px;
          }

          .back {
            display: inline-block;

            margin-top: 25px;

            padding: 15px 30px;

            background: #147a63;

            color: white;

            text-decoration: none;

            border-radius: 8px;

            font-size: 17px;
          }

          .back:hover {
            background: #0f654f;
          }

        </style>

      </head>

      <body>

        <div class="box">

          <h1>
            ✓ Gold Prices Updated Successfully!
          </h1>

          <h2>
            ${updatedProducts} Products Updated
          </h2>

          <div class="stat">

            Gold Variants Updated:

            <span class="number">
              ${updatedVariants}
            </span>

          </div>

          <div class="stat">

            Silver / Other Variants:

            <span class="number">
              ${silverOtherVariants} NOT changed
            </span>

          </div>

          <div class="gold-price">

            New Gold Rate:

            <strong>
              ₹ ${newGoldPrice}
            </strong>

          </div>

          <p>
            All Gold variants across the Shopify store have been checked and updated.
          </p>

          <p>
            Silver prices remain unchanged.
          </p>

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
      "UPDATE ERROR:",
      error.response?.data ||
      error.message
    );

    res.status(500).send(`
      <!DOCTYPE html>

      <html>

      <head>

        <title>Error Updating Products</title>

        <style>

          body {
            font-family: Arial;
            text-align: center;
            padding: 60px;
          }

          .error {
            color: #c62828;
          }

        </style>

      </head>

      <body>

        <h1 class="error">
          ❌ Error Updating Products
        </h1>

        <p>
          ${error.message}
        </p>

        <a href="/">
          ← Go Back
        </a>

      </body>

      </html>
    `);
  }
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
  console.log(
    `🚀 Server running on port ${PORT}`
  );
});
