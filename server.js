const express = require("express");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// =====================================================
// SHOPIFY SETTINGS
// =====================================================

const SHOPIFY_SHOP =
  process.env.SHOPIFY_SHOP || "";

const SHOPIFY_ACCESS_TOKEN =
  process.env.SHOPIFY_ACCESS_TOKEN || "";

const SHOPIFY_CLIENT_ID =
  process.env.SHOPIFY_CLIENT_ID || "";

const SHOPIFY_CLIENT_SECRET =
  process.env.SHOPIFY_CLIENT_SECRET || "";


// =====================================================
// GOLD PRICE
// IMPORTANT:
// SERVER START થાય ત્યારે હંમેશા 0 થી શરૂ થશે
// =====================================================

let currentGoldPrice = 0;


// =====================================================
// INR TO USD
// જો Shopify store USD માં હોય તો
// =====================================================

const INR_TO_USD =
  Number(process.env.INR_TO_USD || 0.012);


// =====================================================
// SAFE NUMBER
// =====================================================

function getNumber(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const cleaned =
    String(value)
      .replace(/,/g, "")
      .replace(/[₹$]/g, "")
      .trim();

  const number = Number(cleaned);

  return Number.isFinite(number)
    ? number
    : 0;
}


// =====================================================
// CLEAN SHOP NAME
// =====================================================

function getShopName() {

  if (!SHOPIFY_SHOP) {
    throw new Error(
      "SHOPIFY_SHOP is missing in Render Environment Variables"
    );
  }

  return SHOPIFY_SHOP
    .replace("https://", "")
    .replace("http://", "")
    .replace(".myshopify.com", "")
    .replace("/", "")
    .trim();
}


// =====================================================
// GET SHOPIFY ACCESS TOKEN
// =====================================================

async function getShopifyAccessToken() {

  // જો Direct Access Token હોય તો
  if (SHOPIFY_ACCESS_TOKEN) {

    console.log("Using SHOPIFY_ACCESS_TOKEN");

    return SHOPIFY_ACCESS_TOKEN;
  }


  // નહિતર Client Credentials use કરવાનો પ્રયાસ
  if (
    !SHOPIFY_CLIENT_ID ||
    !SHOPIFY_CLIENT_SECRET
  ) {

    throw new Error(
      "Shopify authentication is missing. Add SHOPIFY_ACCESS_TOKEN OR SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in Render."
    );

  }


  const shop = getShopName();


  console.log(
    "Generating Shopify access token..."
  );


  const response = await fetch(

    `https://${shop}.myshopify.com/admin/oauth/access_token`,

    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },

      body: new URLSearchParams({

        grant_type:
          "client_credentials",

        client_id:
          SHOPIFY_CLIENT_ID,

        client_secret:
          SHOPIFY_CLIENT_SECRET

      })

    }

  );


  const data = await response.json();


  console.log(
    "Token response:",
    data
  );


  if (!response.ok) {

    throw new Error(

      data.error_description ||
      data.error ||
      data.errors ||
      "Unable to generate Shopify access token"

    );

  }


  if (!data.access_token) {

    throw new Error(
      "Shopify did not return an access token"
    );

  }


  return data.access_token;

}


// =====================================================
// SHOPIFY GRAPHQL REQUEST
// =====================================================

async function shopifyRequest(
  accessToken,
  query,
  variables = {}
) {

  const shop = getShopName();


  const response = await fetch(

    `https://${shop}.myshopify.com/admin/api/2026-07/graphql.json`,

    {

      method: "POST",

      headers: {

        "Content-Type":
          "application/json",

        "X-Shopify-Access-Token":
          accessToken

      },

      body:
        JSON.stringify({

          query,

          variables

        })

    }

  );


  const data =
    await response.json();


  if (!response.ok) {

    console.log(
      "SHOPIFY HTTP ERROR:",
      data
    );

    throw new Error(
      data?.errors?.[0]?.message ||
      data?.message ||
      "Shopify API request failed"
    );

  }


  if (data.errors && data.errors.length > 0) {

    console.log(
      "GRAPHQL ERRORS:",
      data.errors
    );

    throw new Error(
      data.errors[0].message
    );

  }


  return data.data;

}


// =====================================================
// CHECK GOLD VARIANT
// =====================================================

function isGoldVariant(variant) {

  const options =
    variant.selectedOptions || [];


  // દરેક selected option check
  for (const option of options) {

    const name =
      String(option.name || "")
        .toLowerCase()
        .trim();

    const value =
      String(option.value || "")
        .toLowerCase()
        .trim();


    // Gold શબ્દ હોય તો Gold variant
    if (
      value === "gold" ||
      value.includes("gold")
    ) {

      // Silver Gold જેવી કોઈ confusion નહીં
      if (
        !value.includes("silver")
      ) {

        return true;

      }

    }

  }


  // Variant title માં Gold હોય તો પણ
  const title =
    String(variant.title || "")
      .toLowerCase()
      .trim();


  if (
    title.includes("gold") &&
    !title.includes("silver")
  ) {

    return true;

  }


  return false;

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

<title>Gold Price Updater</title>

<style>

* {
  box-sizing: border-box;
}

body {
  font-family: Arial, sans-serif;
  background: #f6f6f7;
  margin: 0;
  padding: 40px 20px;
}

.container {
  max-width: 700px;
  margin: auto;
  background: white;
  padding: 35px;
  border-radius: 15px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
}

h1 {
  margin-top: 0;
  margin-bottom: 25px;
  color: #202223;
  font-size: 34px;
}

.card {
  background: #f6f6f7;
  padding: 25px;
  border-radius: 12px;
}

label {
  display: block;
  font-weight: bold;
  font-size: 16px;
  margin-bottom: 12px;
  color: #202223;
}

input {
  width: 100%;
  padding: 15px;
  font-size: 18px;
  border: 1px solid #8c9196;
  border-radius: 8px;
  margin-bottom: 15px;
}

button {
  width: 100%;
  background: #008060;
  color: white;
  border: none;
  padding: 15px;
  font-size: 17px;
  border-radius: 8px;
  cursor: pointer;
}

button:hover {
  background: #006e52;
}

.price-box {
  margin-top: 25px;
  padding: 22px;
  background: #e3f1df;
  border-radius: 12px;
}

.price-title {
  font-weight: bold;
  font-size: 17px;
}

.price {
  font-size: 30px;
  font-weight: bold;
  color: #008060;
  margin-top: 10px;
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

min="0"

name="goldPrice"

placeholder="Enter today's Gold price"

value=""

required

>


<button type="submit">

Update All Gold Product Prices

</button>


</form>

</div>


<div class="price-box">

<div class="price-title">

Current Gold Price:

</div>


<div class="price">

₹ ${currentGoldPrice}

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


      // ===============================================
      // GET NEW GOLD PRICE
      // ===============================================

      const newGoldPrice =
        getNumber(req.body.goldPrice);


      if (
        newGoldPrice <= 0
      ) {

        throw new Error(
          "Please enter a valid Gold Price"
        );

      }


      // હવે Current Gold Price update થશે
      currentGoldPrice =
        newGoldPrice;


      console.log("");
      console.log("======================================");
      console.log("NEW GOLD PRICE:", currentGoldPrice);
      console.log("======================================");


      // ===============================================
      // GET ACCESS TOKEN
      // ===============================================

      const accessToken =
        await getShopifyAccessToken();


      // ===============================================
      // COUNTERS
      // ===============================================

      let hasNextPage = true;

      let cursor = null;

      let totalProducts = 0;

      let updatedProducts = 0;

      let updatedVariants = 0;

      let skippedProducts = 0;

      let nonGoldVariants = 0;


      // ===============================================
      // LOOP ALL PRODUCT PAGES
      // ===============================================

      while (hasNextPage) {


        const productsQuery = `

query getProducts($cursor: String) {

  products(
    first: 250
    after: $cursor
  ) {

    pageInfo {
      hasNextPage
      endCursor
    }

    nodes {

      id

      title


      goldWeight: metafield(
        namespace: "custom"
        key: "gold_weight"
      ) {
        value
      }


      weight: metafield(
        namespace: "custom"
        key: "weight"
      ) {
        value
      }


      makingCharge: metafield(
        namespace: "custom"
        key: "making_charge"
      ) {
        value
      }


      makingcharge: metafield(
        namespace: "custom"
        key: "makingcharge"
      ) {
        value
      }


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


        const productsData =
          await shopifyRequest(

            accessToken,

            productsQuery,

            {
              cursor
            }

          );


        const connection =
          productsData.products;


        const products =
          connection.nodes || [];


        console.log(
          "PRODUCTS FOUND:",
          products.length
        );


        // =============================================
        // LOOP EVERY PRODUCT
        // =============================================

        for (const product of products) {


          totalProducts++;


          console.log("");
          console.log("--------------------------------------");
          console.log("PRODUCT:", product.title);
          console.log("--------------------------------------");


          // ===========================================
          // GET GOLD WEIGHT
          // ===========================================

          const weightValue =

            product.goldWeight?.value ||

            product.weight?.value ||

            0;


          const goldWeight =
            getNumber(weightValue);


          // ===========================================
          // GET MAKING CHARGE
          // ===========================================

          const makingChargeValue =

            product.makingCharge?.value ||

            product.makingcharge?.value ||

            0;


          const makingCharge =
            getNumber(makingChargeValue);


          // ===========================================
          // FIND GOLD VARIANTS
          // ===========================================

          const goldVariants =
            product.variants.nodes.filter(
              isGoldVariant
            );


          const otherVariants =
            product.variants.nodes.filter(
              variant => !isGoldVariant(variant)
            );


          nonGoldVariants +=
            otherVariants.length;


          // ===========================================
          // NO GOLD VARIANT
          // ===========================================

          if (
            goldVariants.length === 0
          ) {

            console.log(
              "SKIPPED: No Gold variant"
            );

            skippedProducts++;

            continue;

          }


          // ===========================================
          // INVALID GOLD WEIGHT
          // ===========================================

          if (
            goldWeight <= 0
          ) {

            console.log(
              "SKIPPED: Gold weight missing"
            );

            skippedProducts++;

            continue;

          }


          // ===========================================
          // CALCULATE INR PRICE
          // ===========================================

          const priceINR =

            (
              currentGoldPrice *
              goldWeight
            )

            +

            makingCharge;


          // ===========================================
          // CONVERT TO USD
          // ===========================================

          const priceUSD =

            priceINR *
            INR_TO_USD;


          const finalPrice =
            Number(
              priceUSD.toFixed(2)
            );


          if (
            !Number.isFinite(finalPrice) ||
            finalPrice <= 0
          ) {

            console.log(
              "SKIPPED: Invalid price calculation"
            );

            skippedProducts++;

            continue;

          }


          console.log(
            "Gold Weight:",
            goldWeight
          );

          console.log(
            "Making Charge:",
            makingCharge
          );

          console.log(
            "Final USD Price:",
            finalPrice
          );


          // ===========================================
          // PREPARE GOLD VARIANTS ONLY
          // ===========================================

          const variantsToUpdate =

            goldVariants.map(
              variant => ({

                id:
                  variant.id,

                price:
                  finalPrice.toFixed(2)

              })
            );


          // ===========================================
          // UPDATE VARIANTS
          // ===========================================

          const updateMutation = `

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


          const updateData =
            await shopifyRequest(

              accessToken,

              updateMutation,

              {

                productId:
                  product.id,

                variants:
                  variantsToUpdate

              }

            );


          const userErrors =

            updateData
              ?.productVariantsBulkUpdate
              ?.userErrors || [];


          if (
            userErrors.length > 0
          ) {

            console.log(
              "UPDATE ERROR:",
              userErrors
            );

            skippedProducts++;

            continue;

          }


          // ===========================================
          // SUCCESS
          // ===========================================

          updatedProducts++;

          updatedVariants +=
            variantsToUpdate.length;


          console.log(
            "SUCCESSFULLY UPDATED:",
            product.title
          );


        }


        // =============================================
        // NEXT PAGE
        // =============================================

        hasNextPage =
          connection.pageInfo.hasNextPage;


        cursor =
          connection.pageInfo.endCursor;


      }


      // ===============================================
      // SUCCESS PAGE
      // ===============================================

      res.send(`

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>Products Updated</title>

<style>

body {
  font-family: Arial, sans-serif;
  background: #f6f6f7;
  padding: 50px 20px;
  text-align: center;
}

.container {
  max-width: 650px;
  margin: auto;
  background: white;
  padding: 40px;
  border-radius: 15px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
}

.success {
  color: #008060;
  font-size: 30px;
}

.info {
  font-size: 17px;
  line-height: 1.8;
}

.number {
  color: #008060;
  font-weight: bold;
}

a {
  display: inline-block;
  margin-top: 25px;
  padding: 13px 25px;
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


<div class="info">


<p>

Total Products Checked:

<span class="number">

${totalProducts}

</span>

</p>


<p>

Products Updated:

<span class="number">

${updatedProducts}

</span>

</p>


<p>

Gold Variants Updated:

<span class="number">

${updatedVariants}

</span>

</p>


<p>

Non-Gold Variants Not Changed:

<span class="number">

${nonGoldVariants}

</span>

</p>


<p>

Skipped Products:

<span class="number">

${skippedProducts}

</span>

</p>


<p>

Current Gold Price:

<span class="number">

₹ ${currentGoldPrice}

</span>

</p>


</div>


<a href="/">

← Go Back

</a>


</div>

</body>

</html>

      `);


    } catch (error) {


      console.error(
        "FULL ERROR:",
        error
      );


      res.send(`

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>Error</title>

<style>

body {
  font-family: Arial;
  background: #f6f6f7;
  padding: 50px 20px;
  text-align: center;
}

.container {
  max-width: 700px;
  background: white;
  margin: auto;
  padding: 40px;
  border-radius: 15px;
}

.error {
  color: #d72c0d;
}

a {
  display: inline-block;
  margin-top: 25px;
}

</style>

</head>

<body>

<div class="container">

<h1 class="error">

❌ Error Updating Products

</h1>

<p>

${String(error.message)}

</p>

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
// SERVER
// =====================================================

const PORT =
  process.env.PORT || 10000;


app.listen(
  PORT,
  () => {

    console.log(
      "Gold Price Updater running on port " + PORT
    );

  }
);
