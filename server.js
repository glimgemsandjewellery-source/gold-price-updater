const express = require("express");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// ==========================================
// SETTINGS
// ==========================================

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;

const INR_TO_USD = Number(process.env.INR_TO_USD || 0.012);


// ==========================================
// CURRENT PRICES
// ==========================================

let goldPrice = 0;
let silverPrice = 0;


// ==========================================
// GET SHOPIFY STORE DOMAIN
// ==========================================

function getShopDomain() {

  let store = (SHOPIFY_STORE || "").trim();

  store = store
    .replace("https://", "")
    .replace("http://", "")
    .replace(/\/$/, "");

  if (!store.includes(".myshopify.com")) {
    store = store + ".myshopify.com";
  }

  return store;

}


// ==========================================
// GET SHOPIFY ACCESS TOKEN AUTOMATICALLY
// ==========================================

async function getShopifyAccessToken() {

  const shop = getShopDomain();

  if (
    !SHOPIFY_CLIENT_ID ||
    !SHOPIFY_CLIENT_SECRET ||
    !SHOPIFY_STORE
  ) {
    throw new Error(
      "Missing Shopify settings in Render Environment Variables."
    );
  }


  const response = await fetch(

    `https://${shop}/admin/oauth/access_token`,

    {

      method: "POST",

      headers: {

        "Content-Type":
          "application/x-www-form-urlencoded"

      },

      body: new URLSearchParams({

        grant_type: "client_credentials",

        client_id: SHOPIFY_CLIENT_ID,

        client_secret: SHOPIFY_CLIENT_SECRET

      }).toString()

    }

  );


  const data = await response.json();


  if (!response.ok || !data.access_token) {

    console.log(
      "Token Error:",
      data
    );

    throw new Error(

      data.error_description ||
      data.error ||
      "Unable to get Shopify Access Token"

    );

  }


  return data.access_token;

}


// ==========================================
// SHOPIFY GRAPHQL REQUEST
// ==========================================

async function shopifyGraphQL(
  accessToken,
  query,
  variables = {}
) {

  const shop = getShopDomain();


  const response = await fetch(

    `https://${shop}/admin/api/2026-07/graphql.json`,

    {

      method: "POST",

      headers: {

        "Content-Type":
          "application/json",

        "X-Shopify-Access-Token":
          accessToken

      },

      body: JSON.stringify({

        query,
        variables

      })

    }

  );


  const result =
    await response.json();


  if (!response.ok) {

    console.log(
      "Shopify API Error:",
      result
    );

    throw new Error(
      "Unable to connect to Shopify API"
    );

  }


  if (result.errors) {

    console.log(
      "GraphQL Errors:",
      result.errors
    );

    throw new Error(
      result.errors[0].message ||
      "Shopify GraphQL Error"
    );

  }


  return result.data;

}


// ==========================================
// HOME PAGE
// ==========================================

app.get("/", (req, res) => {

  res.send(`

<!DOCTYPE html>

<html>

<head>

<title>Gold & Silver Price Updater</title>

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
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
}

h1 {
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
  margin-top: 15px;
  margin-bottom: 8px;
}

input {
  width: 100%;
  padding: 14px;
  font-size: 18px;
  border: 1px solid #babfc3;
  border-radius: 8px;
}

button {
  width: 100%;
  margin-top: 25px;
  background: #008060;
  color: white;
  border: none;
  padding: 15px;
  font-size: 17px;
  border-radius: 8px;
  cursor: pointer;
}

.price-box {
  margin-top: 20px;
  padding: 20px;
  background: #e3f1df;
  border-radius: 10px;
}

.price {
  font-size: 25px;
  font-weight: bold;
  color: #008060;
  margin-top: 5px;
}

</style>

</head>

<body>

<div class="container">

<h1>💰 Gold & Silver Price Updater</h1>

<div class="card">

<form action="/update-prices" method="POST">

<label>
Today's Gold Price (₹ Per Gram)
</label>

<input
type="number"
step="0.01"
name="goldPrice"
placeholder="Example: 7500"
value="${goldPrice}"
required
>


<label>
Today's Silver Price (₹ Per Gram)
</label>

<input
type="number"
step="0.01"
name="silverPrice"
placeholder="Example: 100"
value="${silverPrice}"
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

₹ ${goldPrice} / Gram

</div>

<br>

<b>Current Silver Price:</b>

<div class="price">

₹ ${silverPrice} / Gram

</div>

</div>

</div>

</body>

</html>

  `);

});


// ==========================================
// UPDATE ALL PRODUCTS
// ==========================================

app.post(
  "/update-prices",
  async (req, res) => {

    try {


      goldPrice =
        Number(req.body.goldPrice);

      silverPrice =
        Number(req.body.silverPrice);


      // ==========================================
      // VALIDATION
      // ==========================================

      if (
        !goldPrice ||
        goldPrice <= 0
      ) {

        return res.send(`

          <h1>❌ Invalid Gold Price</h1>

          <a href="/">
          ← Go Back
          </a>

        `);

      }


      if (
        !silverPrice ||
        silverPrice <= 0
      ) {

        return res.send(`

          <h1>❌ Invalid Silver Price</h1>

          <a href="/">
          ← Go Back
          </a>

        `);

      }


      // ==========================================
      // GET ACCESS TOKEN AUTOMATICALLY
      // ==========================================

      const accessToken =
        await getShopifyAccessToken();


      console.log(
        "Shopify Access Token Generated Successfully"
      );


      // ==========================================
      // GET ALL PRODUCTS
      // ==========================================

      const productsQuery = `

        query {

          products(first: 250) {

            nodes {

              id

              title


              goldWeight:
              metafield(
                namespace: "custom",
                key: "gold_weight"
              ) {
                value
              }


              goldWeightAlt:
              metafield(
                namespace: "custom",
                key: "goldweight"
              ) {
                value
              }


              silverWeight:
              metafield(
                namespace: "custom",
                key: "silver_weight"
              ) {
                value
              }


              silverWeightAlt:
              metafield(
                namespace: "custom",
                key: "silverweight"
              ) {
                value
              }


              makingCharge:
              metafield(
                namespace: "custom",
                key: "making_charge"
              ) {
                value
              }


              makingChargeAlt:
              metafield(
                namespace: "custom",
                key: "makingcharge"
              ) {
                value
              }


              variants(first: 250) {

                nodes {

                  id

                }

              }

            }

          }

        }

      `;


      const productsData =
        await shopifyGraphQL(

          accessToken,
          productsQuery

        );


      const products =
        productsData.products.nodes || [];


      let updatedProducts = 0;

      let skippedProducts = 0;


      // ==========================================
      // LOOP ALL PRODUCTS
      // ==========================================

      for (const product of products) {


        // ==========================================
        // GET GOLD WEIGHT
        // ==========================================

        const goldWeightValue =

          product.goldWeight?.value ||

          product.goldWeightAlt?.value ||

          0;


        const goldWeight =
          Number(goldWeightValue);


        // ==========================================
        // GET SILVER WEIGHT
        // ==========================================

        const silverWeightValue =

          product.silverWeight?.value ||

          product.silverWeightAlt?.value ||

          0;


        const silverWeight =
          Number(silverWeightValue);


        // ==========================================
        // GET MAKING CHARGE
        // ==========================================

        const makingChargeValue =

          product.makingCharge?.value ||

          product.makingChargeAlt?.value ||

          0;


        const makingCharge =
          Number(makingChargeValue);


        // ==========================================
        // SKIP IF NO GOLD OR SILVER WEIGHT
        // ==========================================

        if (
          goldWeight <= 0 &&
          silverWeight <= 0
        ) {

          console.log(

            "Skipped:",

            product.title,

            "- No Gold/Silver Weight"

          );


          skippedProducts++;

          continue;

        }


        // ==========================================
        // PRICE CALCULATION INR
        // ==========================================

        const goldTotal =

          goldPrice *
          goldWeight;


        const silverTotal =

          silverPrice *
          silverWeight;


        const priceINR =

          goldTotal +

          silverTotal +

          makingCharge;


        // ==========================================
        // INR TO USD
        // ==========================================

        const priceUSD =

          priceINR *
          INR_TO_USD;


        const finalPrice =

          Number(
            priceUSD.toFixed(2)
          );


        // ==========================================
        // PREPARE VARIANTS
        // ==========================================

        const variants =

          product.variants.nodes.map(

            variant => ({

              id: variant.id,

              price:
                finalPrice.toFixed(2)

            })

          );


        // ==========================================
        // UPDATE PRODUCT VARIANTS
        // ==========================================

        const updateMutation = `

          mutation UpdateVariants(

            $productId: ID!,

            $variants:
            [ProductVariantsBulkInput!]!

          ) {

            productVariantsBulkUpdate(

              productId: $productId,

              variants: $variants

            ) {

              product {

                id

              }


              userErrors {

                field

                message

              }

            }

          }

        `;


        const updateData =
          await shopifyGraphQL(

            accessToken,

            updateMutation,

            {

              productId:
                product.id,

              variants

            }

          );


        const userErrors =

          updateData
            .productVariantsBulkUpdate
            .userErrors;


        if (
          userErrors &&
          userErrors.length > 0
        ) {

          console.log(

            "Update Error:",

            product.title,

            userErrors

          );

          continue;

        }


        updatedProducts++;


        console.log(

          "Updated:",

          product.title,

          "INR:",

          priceINR,

          "USD:",

          finalPrice

        );

      }


      // ==========================================
      // SUCCESS PAGE
      // ==========================================

      res.send(`

<!DOCTYPE html>

<html>

<head>

<title>Products Updated</title>

<style>

body {

  font-family: Arial;

  background: #f6f6f7;

  padding: 50px;

  text-align: center;

}

.container {

  max-width: 600px;

  margin: auto;

  background: white;

  padding: 40px;

  border-radius: 15px;

}

.success {

  color: green;

  font-size: 30px;

}

a {

  display: inline-block;

  margin-top: 20px;

  padding: 12px 20px;

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

✅ Products Updated Successfully!

</h1>


<h2>

${updatedProducts} Products Updated

</h2>


<p>

<b>Gold Price:</b>

₹ ${goldPrice} Per Gram

</p>


<p>

<b>Silver Price:</b>

₹ ${silverPrice} Per Gram

</p>


<p>

<b>Skipped Products:</b>

${skippedProducts}

</p>


<a href="/">

← Update Prices Again

</a>

</div>

</body>

</html>

      `);


    }

    catch (error) {


      console.error(error);


      res.send(`

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

      `);

    }

  }
);


// ==========================================
// SERVER
// ==========================================

const PORT =
  process.env.PORT || 10000;


app.listen(PORT, () => {

  console.log(

    "Gold & Silver Price Updater running on port " +
    PORT

  );

});
