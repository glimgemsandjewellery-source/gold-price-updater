const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// =====================================================
// ENVIRONMENT VARIABLES
// =====================================================

const SHOPIFY_STORE =
  process.env.SHOPIFY_STORE ||
  process.env.SHOPIFY_SHOP;

const SHOPIFY_ACCESS_TOKEN =
  process.env.SHOPIFY_ACCESS_TOKEN;

const INR_TO_USD = Number(process.env.INR_TO_USD || 85);

// Shopify API Version
const API_VERSION = "2025-10";


// =====================================================
// VALIDATION
// =====================================================

if (!SHOPIFY_STORE) {
  console.error("❌ SHOPIFY_STORE is missing");
}

if (!SHOPIFY_ACCESS_TOKEN) {
  console.error("❌ SHOPIFY_ACCESS_TOKEN is missing");
}


// =====================================================
// SHOPIFY GRAPHQL FUNCTION
// =====================================================

async function shopifyGraphQL(query, variables = {}) {
  const store = SHOPIFY_STORE
    .replace("https://", "")
    .replace("http://", "")
    .replace(".myshopify.com", "");

  const url = `https://${store}.myshopify.com/admin/api/${API_VERSION}/graphql.json`;

  try {
    const response = await axios.post(
      url,
      {
        query,
        variables,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        },
      }
    );

    if (response.data.errors) {
      console.error("SHOPIFY GRAPHQL ERRORS:");
      console.error(JSON.stringify(response.data.errors, null, 2));

      throw new Error(response.data.errors[0].message);
    }

    return response.data.data;

  } catch (error) {

    console.error(
      "SHOPIFY API ERROR:",
      error.response?.data || error.message
    );

    throw error;
  }
}


// =====================================================
// HOME PAGE
// =====================================================

app.get("/", async (req, res) => {

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

  font-family: Arial, sans-serif;

  background: #f4f5f7;

  color: #222;

}

.container {

  max-width: 700px;

  margin: 70px auto;

  background: white;

  padding: 38px;

  border-radius: 18px;

  box-shadow:
  0 10px 35px rgba(0,0,0,0.12);

}

h1 {

  margin-top: 0;

  font-size: 32px;

}

.form-box {

  background: #f5f6f8;

  padding: 25px;

  border-radius: 14px;

}

label {

  display: block;

  font-size: 18px;

  font-weight: bold;

  margin-bottom: 12px;

}

input {

  width: 100%;

  padding: 16px;

  font-size: 20px;

  border: 1px solid #ccc;

  border-radius: 10px;

  margin-bottom: 16px;

}

button {

  width: 100%;

  padding: 16px;

  border: none;

  border-radius: 10px;

  background: #167a67;

  color: white;

  font-size: 18px;

  font-weight: bold;

  cursor: pointer;

}

button:hover {

  background: #106553;

}

.important {

  margin-top: 20px;

  background: #fff7e8;

  border-radius: 14px;

  padding: 22px;

  line-height: 1.7;

  font-size: 17px;

}

.last-price {

  margin-top: 22px;

  background: #edf7ef;

  border-radius: 14px;

  padding: 22px;

}

.last-price h3 {

  margin-top: 0;

}

.rate {

  font-size: 30px;

  font-weight: bold;

  color: #176d5d;

}

</style>

</head>


<body>

<div class="container">

<h1>💰 Gold Price Updater</h1>


<div class="form-box">

<form method="POST" action="/update-gold-price">

<label>Today's Gold Price (₹)</label>

<input
type="number"
name="goldPrice"
placeholder="Enter Gold Price"
required
min="1"
step="0.01"
/>

<button type="submit">

Update ALL Gold Product Prices

</button>

</form>

</div>


<div class="important">

<b>Important:</b>

<br><br>

• Only <b>Gold variants</b> will be updated.

<br>

• <b>Silver prices will NOT change.</b>

<br>

• All Gold products will be checked automatically.

<br>

• Client enters the Daily Gold Rate in <b>₹ INR</b>.

<br>

• Shopify price will automatically be converted into <b>$ USD</b>.

<br>

• This is <b>NOT per gram pricing</b>.

<br>

• Prices change only when you enter a new Gold Price and click Update.

<br>

• Existing Silver / other product prices remain unchanged.

</div>


<div class="last-price">

<h3>Currency Conversion</h3>

<div>

₹ INR → $ USD

</div>

<br>

<div class="rate">

1 USD = ₹ ${INR_TO_USD}

</div>

</div>


</div>

</body>

</html>
  `);

});


// =====================================================
// CHECK IF VARIANT IS GOLD
// =====================================================

function isGoldVariant(variant) {

  if (!variant.selectedOptions) {
    return false;
  }

  // Check ALL option values

  for (const option of variant.selectedOptions) {

    const optionName =
      String(option.name || "").toLowerCase();

    const optionValue =
      String(option.value || "").toLowerCase();

    // GOLD VALUE DETECTION

    if (
      optionValue === "gold" ||
      optionValue.includes("gold")
    ) {
      return true;
    }

    // Extra safety for Metal Type / Material

    if (
      (
        optionName.includes("metal") ||
        optionName.includes("material") ||
        optionName.includes("type")
      )
      &&
      optionValue.includes("gold")
    ) {
      return true;
    }

  }

  return false;
}


// =====================================================
// GET ALL PRODUCTS FROM SHOPIFY
// =====================================================

async function getAllProducts() {

  let allProducts = [];

  let hasNextPage = true;

  let cursor = null;


  while (hasNextPage) {

    const query = `
      query getProducts($cursor: String) {

        products(
          first: 100
          after: $cursor
        ) {

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


    const data = await shopifyGraphQL(
      query,
      {
        cursor,
      }
    );


    const products = data.products;


    for (const edge of products.edges) {

      allProducts.push(edge.node);

    }


    hasNextPage =
      products.pageInfo.hasNextPage;

    cursor =
      products.pageInfo.endCursor;


    console.log(
      `📦 Products loaded: ${allProducts.length}`
    );

  }


  return allProducts;
}


// =====================================================
// UPDATE PRODUCT VARIANTS
// =====================================================

async function updateProductVariants(
  productId,
  variants
) {

  if (!variants.length) {
    return {
      updated: 0,
      errors: [],
    };
  }


  const mutation = `
    mutation updateVariants(
      $productId: ID!
      $variants: [ProductVariantsBulkInput!]!
    ) {

      productVariantsBulkUpdate(

        productId: $productId

        variants: $variants

      ) {

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

    variants: variants.map((variant) => ({

      id: variant.id,

      price: variant.price,

    })),

  };


  const data = await shopifyGraphQL(
    mutation,
    variables
  );


  const result =
    data.productVariantsBulkUpdate;


  if (
    result.userErrors &&
    result.userErrors.length > 0
  ) {

    console.error(
      "VARIANT UPDATE ERRORS:",
      result.userErrors
    );

    return {
      updated: 0,
      errors: result.userErrors,
    };

  }


  return {

    updated:
      result.productVariants?.length || 0,

    errors: [],

  };
}


// =====================================================
// UPDATE ALL GOLD PRODUCTS
// =====================================================

app.post(
  "/update-gold-price",

  async (req, res) => {

    try {

      // ===============================================
      // GET GOLD PRICE FROM CLIENT
      // ===============================================

      const goldPriceINR =
        Number(req.body.goldPrice);


      if (
        !goldPriceINR ||
        goldPriceINR <= 0 ||
        Number.isNaN(goldPriceINR)
      ) {

        return res.send(`
          <h1>❌ Invalid Gold Price</h1>
          <a href="/">← Go Back</a>
        `);

      }


      // ===============================================
      // CHECK CONFIGURATION
      // ===============================================

      if (!SHOPIFY_STORE) {

        throw new Error(
          "SHOPIFY_STORE is missing in Environment Variables"
        );

      }


      if (!SHOPIFY_ACCESS_TOKEN) {

        throw new Error(
          "SHOPIFY_ACCESS_TOKEN is missing in Environment Variables"
        );

      }


      // ===============================================
      // INR TO USD CONVERSION
      //
      // EXAMPLE:
      //
      // ₹75000 / 85 = $882.35
      //
      // NOT PER GRAM
      // ===============================================

      const goldPriceUSD =
        Number(
          (
            goldPriceINR / INR_TO_USD
          ).toFixed(2)
        );


      console.log("");
      console.log("====================================");
      console.log("💰 GOLD PRICE UPDATE STARTED");
      console.log("INR PRICE:", goldPriceINR);
      console.log("USD PRICE:", goldPriceUSD);
      console.log("====================================");


      // ===============================================
      // GET ALL PRODUCTS
      // ===============================================

      const products =
        await getAllProducts();


      console.log(
        `📦 TOTAL PRODUCTS FOUND: ${products.length}`
      );


      let productsUpdated = 0;

      let goldVariantsUpdated = 0;

      let silverOtherVariants = 0;

      let productsSkipped = 0;

      let errorProducts = 0;


      // ===============================================
      // LOOP THROUGH ALL PRODUCTS
      // ===============================================

      for (const product of products) {

        try {

          const goldVariants = [];


          // =============================================
          // CHECK EVERY VARIANT
          // =============================================

          for (
            const variantEdge
            of product.variants.edges
          ) {

            const variant =
              variantEdge.node;


            // ===========================================
            // ONLY GOLD VARIANT
            // ===========================================

            if (isGoldVariant(variant)) {

              goldVariants.push({

                id: variant.id,

                // New Gold Price in USD
                price:
                  goldPriceUSD.toFixed(2),

              });

            }

            else {

              // SILVER / OTHER
              // ABSOLUTELY NO CHANGE

              silverOtherVariants++;

            }

          }


          // =============================================
          // NO GOLD VARIANT IN THIS PRODUCT
          // =============================================

          if (goldVariants.length === 0) {

            productsSkipped++;

            console.log(
              `⏭️ SKIPPED: ${product.title}`
            );

            continue;

          }


          // =============================================
          // UPDATE GOLD VARIANTS
          // =============================================

          console.log(
            `🟡 UPDATING PRODUCT: ${product.title}`
          );

          console.log(
            `🟡 GOLD VARIANTS: ${goldVariants.length}`
          );


          const result =
            await updateProductVariants(
              product.id,
              goldVariants
            );


          if (
            result.errors.length > 0
          ) {

            errorProducts++;

            console.log(
              `❌ ERROR: ${product.title}`
            );

          }

          else {

            productsUpdated++;

            goldVariantsUpdated +=
              result.updated;

            console.log(
              `✅ UPDATED: ${product.title}`
            );

          }


        }

        catch (productError) {

          errorProducts++;

          console.error(
            `❌ PRODUCT ERROR: ${product.title}`,
            productError.message
          );

        }

      }


      console.log("");
      console.log("====================================");
      console.log("✅ UPDATE COMPLETED");
      console.log(
        "PRODUCTS UPDATED:",
        productsUpdated
      );
      console.log(
        "GOLD VARIANTS UPDATED:",
        goldVariantsUpdated
      );
      console.log("====================================");


      // ===============================================
      // SUCCESS PAGE
      // ===============================================

      res.send(`
<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>Gold Prices Updated</title>


<style>

body {

  margin: 0;

  font-family: Arial, sans-serif;

  background: #f4f5f7;

  color: #222;

}

.card {

  max-width: 650px;

  margin: 100px auto;

  background: white;

  text-align: center;

  padding: 45px;

  border-radius: 18px;

  box-shadow:
  0 10px 35px rgba(0,0,0,0.12);

}

h1 {

  color: #176d5d;

  font-size: 30px;

}

.big {

  font-size: 24px;

  font-weight: bold;

  margin: 20px 0;

}

.info {

  font-size: 17px;

  line-height: 2;

}

.success {

  color: #176d5d;

  font-weight: bold;

}

hr {

  margin: 25px 0;

}

button {

  background: #167a67;

  color: white;

  border: none;

  padding: 14px 30px;

  border-radius: 8px;

  font-size: 16px;

  cursor: pointer;

}

button:hover {

  background: #106553;

}

</style>

</head>


<body>


<div class="card">


<h1>
✅ Gold Prices Updated Successfully!
</h1>


<div class="big">

${productsUpdated} Products Updated

</div>


<div class="info">

<b>
Gold Variants Updated:
</b>

${goldVariantsUpdated}

<br>


<b>
Silver / Other Variants:
</b>

<span class="success">

${silverOtherVariants} NOT changed

</span>

<br>


<b>
Skipped Products:
</b>

${productsSkipped}

<br>


<b>
Errors:
</b>

${errorProducts}

<br><br>


<b>
Today's Gold Price:
</b>

₹ ${goldPriceINR.toLocaleString("en-IN")}

<br>


<b>
New Shopify Gold Price:
</b>

$ ${goldPriceUSD.toFixed(2)}

<br>


<b>
Currency:
</b>

Automatically converted from ₹ INR to $ USD


</div>


<hr>


<p class="success">

✓ Only Gold variants were updated.

</p>


<p class="success">

✓ Silver prices remain exactly unchanged.

</p>


<p>

Prices will not change again until a client enters a new Gold price and clicks Update.

</p>


<br>


<a href="/">

<button>

← Go Back

</button>

</a>


</div>


</body>

</html>
      `);


    }

    catch (error) {

      console.error("");
      console.error("❌ MAIN UPDATE ERROR");
      console.error(error);


      res.send(`
<!DOCTYPE html>

<html>

<head>

<title>Error Updating Products</title>

<style>

body {

  font-family: Arial;

  text-align: center;

  padding: 80px;

  background: #f4f5f7;

}

.card {

  background: white;

  max-width: 700px;

  margin: auto;

  padding: 40px;

  border-radius: 15px;

}

h1 {

  color: #c0392b;

}

.error {

  color: #c0392b;

  word-break: break-word;

}

</style>

</head>


<body>

<div class="card">

<h1>
❌ Error Updating Products
</h1>

<p class="error">

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

  }
);


// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/health", (req, res) => {

  res.status(200).send("Gold Price Updater is running");

});


// =====================================================
// START SERVER
// =====================================================

const PORT =
  process.env.PORT || 3000;


app.listen(PORT, () => {

  console.log(
    `🚀 Gold Price Updater running on port ${PORT}`
  );

});
