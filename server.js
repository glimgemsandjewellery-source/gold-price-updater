const express = require("express");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let goldPrice = 0;


// ==========================================
// RENDER ENVIRONMENT VARIABLES
// ==========================================

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;

const SHOPIFY_CLIENT_ID =
  process.env.SHOPIFY_CLIENT_ID;

const SHOPIFY_CLIENT_SECRET =
  process.env.SHOPIFY_CLIENT_SECRET;

const INR_TO_USD =
  Number(process.env.INR_TO_USD || 0.012);


// ==========================================
// GET SHOPIFY ACCESS TOKEN AUTOMATICALLY
// ==========================================

async function getShopifyAccessToken() {

  if (
    !SHOPIFY_SHOP ||
    !SHOPIFY_CLIENT_ID ||
    !SHOPIFY_CLIENT_SECRET
  ) {

    throw new Error(
      "Missing Shopify Environment Variables"
    );

  }


  const shop =
    SHOPIFY_SHOP
      .replace("https://", "")
      .replace("http://", "")
      .replace(".myshopify.com", "")
      .trim();


  const response = await fetch(

    `https://${shop}.myshopify.com/admin/oauth/access_token`,

    {

      method: "POST",

      headers: {

        "Content-Type":
          "application/x-www-form-urlencoded"

      },

      body:

        new URLSearchParams({

          grant_type:
            "client_credentials",

          client_id:
            SHOPIFY_CLIENT_ID,

          client_secret:
            SHOPIFY_CLIENT_SECRET

        })

    }

  );


  const data =
    await response.json();


  if (!response.ok) {

    console.log(
      "TOKEN ERROR:",
      data
    );

    throw new Error(

      data.error_description ||

      data.error ||

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


// ==========================================
// SHOPIFY GRAPHQL REQUEST
// ==========================================

async function shopifyRequest(
  accessToken,
  query,
  variables = {}
) {

  const shop =
    SHOPIFY_SHOP
      .replace("https://", "")
      .replace("http://", "")
      .replace(".myshopify.com", "")
      .trim();


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
      "SHOPIFY API ERROR:",
      data
    );

    throw new Error(
      "Shopify API connection failed"
    );

  }


  if (data.errors) {

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


// ==========================================
// HOME PAGE
// YOUR ORIGINAL DESIGN
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
  width: 100%;
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

<form
action="/update-gold-price"
method="POST"
>

<label>
Today's Gold Price
</label>

<input

type="number"

step="0.01"

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


// ==========================================
// UPDATE GOLD PRODUCTS
// ==========================================

app.post(

  "/update-gold-price",

  async (req, res) => {

    try {


      // ======================================
      // GET GOLD PRICE
      // ======================================

      goldPrice =
        Number(req.body.goldPrice);


      if (
        !goldPrice ||
        goldPrice <= 0
      ) {

        throw new Error(
          "Please enter a valid Gold Price"
        );

      }


      console.log(
        "Today's Gold Price:",
        goldPrice
      );


      // ======================================
      // GENERATE ACCESS TOKEN AUTOMATICALLY
      // ======================================

      console.log(
        "Generating Shopify access token..."
      );


      const accessToken =
        await getShopifyAccessToken();


      console.log(
        "Shopify token generated successfully"
      );


      // ======================================
      // GET PRODUCTS
      // ======================================

      const productsQuery = `

query {

  products(first: 250) {

    nodes {

      id

      title


      goldWeight:

      metafield(

        namespace: "custom"

        key: "gold_weight"

      ) {

        value

      }


      weight:

      metafield(

        namespace: "custom"

        key: "weight"

      ) {

        value

      }


      makingCharge:

      metafield(

        namespace: "custom"

        key: "making_charge"

      ) {

        value

      }


      makingCharge2:

      metafield(

        namespace: "custom"

        key: "makingcharge"

      ) {

        value

      }


      variants(first: 100) {

        nodes {

          id

        }

      }

    }

  }

}

      `;


      const productsData =
        await shopifyRequest(

          accessToken,

          productsQuery

        );


      const products =
        productsData.products.nodes;


      console.log(
        "Products found:",
        products.length
      );


      let updatedProducts = 0;

      let updatedVariants = 0;

      let skippedProducts = 0;


      // ======================================
      // LOOP PRODUCTS
      // ======================================

      for (
        const product
        of products
      ) {


        // ====================================
        // GET GOLD WEIGHT
        // ====================================

        const weightValue =

          product.goldWeight?.value ||

          product.weight?.value;


        if (!weightValue) {

          console.log(
            "SKIPPED - No Gold Weight:",

            product.title
          );

          skippedProducts++;

          continue;

        }


        const goldWeight =
          Number(weightValue);


        // ====================================
        // GET MAKING CHARGE
        // ====================================

        const makingChargeValue =

          product.makingCharge?.value ||

          product.makingCharge2?.value ||

          0;


        const makingCharge =
          Number(makingChargeValue);


        // ====================================
        // CALCULATE INR PRICE
        // ====================================

        const priceINR =

          (goldPrice * goldWeight)

          +

          makingCharge;


        // ====================================
        // CONVERT INR TO USD
        // ====================================

        const priceUSD =

          priceINR * INR_TO_USD;


        const finalPrice =
          Number(
            priceUSD.toFixed(2)
          );


        console.log(

          "PRODUCT:",

          product.title

        );


        console.log(

          "WEIGHT:",

          goldWeight

        );


        console.log(

          "FINAL PRICE:",

          finalPrice

        );


        // ====================================
        // PREPARE VARIANTS
        // ====================================

        const variants =

          product.variants.nodes.map(

            variant => ({

              id:
                variant.id,

              price:
                finalPrice.toFixed(2)

            })

          );


        if (
          variants.length === 0
        ) {

          skippedProducts++;

          continue;

        }


        // ====================================
        // UPDATE VARIANTS
        // ====================================

        const updateMutation = `

mutation updateVariants(

  $productId: ID!

  $variants:
  [ProductVariantsBulkInput!]!

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
                variants

            }

          );


        const errors =

          updateData
            .productVariantsBulkUpdate
            .userErrors;


        if (
          errors.length > 0
        ) {

          console.log(

            "UPDATE ERROR:",

            product.title,

            errors

          );


          skippedProducts++;

          continue;

        }


        updatedProducts++;

        updatedVariants +=
          variants.length;


        console.log(

          "SUCCESSFULLY UPDATED:",

          product.title

        );

      }


      // ======================================
      // SUCCESS PAGE
      // ======================================

      res.send(`

<!DOCTYPE html>

<html>

<head>

<title>
Products Updated
</title>

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

border-radius: 12px;

}

.success {

color: #008060;

font-size: 28px;

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

✅ Products Updated Successfully!

</h1>

<h2>

${updatedProducts}
Products Updated

</h2>

<p>

Variants Updated:

<strong>

${updatedVariants}

</strong>

</p>

<p>

Today's Gold Price:

₹ ${goldPrice}

</p>

<p>

Skipped Products:

${skippedProducts}

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

        "ERROR:",

        error

      );


      res.send(`

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


// ==========================================
// SERVER
// ==========================================

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
