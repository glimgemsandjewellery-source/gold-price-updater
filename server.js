const express = require("express");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// ==========================================
// SETTINGS
// ==========================================

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;

const SHOPIFY_CLIENT_ID =
  process.env.SHOPIFY_CLIENT_ID;

const SHOPIFY_CLIENT_SECRET =
  process.env.SHOPIFY_CLIENT_SECRET;


// INR TO USD CONVERSION
// Example: ₹1 = $0.012
const INR_TO_USD =
  Number(process.env.INR_TO_USD || 0.012);


// This only shows the last entered price
// It DOES NOT automatically update Shopify
let goldPrice = 0;


// ==========================================
// HELPER - SAFE NUMBER
// ==========================================

function getNumber(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return 0;

  }

  const number =
    Number(
      String(value)
        .replace(/,/g, "")
        .trim()
    );

  return Number.isFinite(number)
    ? number
    : 0;

}


// ==========================================
// GET SHOPIFY ACCESS TOKEN
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
      data?.errors?.[0]?.message ||
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
// CHECK IF VARIANT IS GOLD
// ==========================================

function isGoldVariant(variant) {

  if (!variant.selectedOptions) {

    return false;

  }


  return variant.selectedOptions.some(
    option => {

      const optionName =
        String(option.name || "")
          .trim()
          .toLowerCase();

      const optionValue =
        String(option.value || "")
          .trim()
          .toLowerCase();


      // IMPORTANT:
      // Only Metal Type = Gold will update

      return (

        (
          optionName === "metal type" ||
          optionName === "metal"
        )

        &&

        optionValue === "gold"

      );

    }
  );

}


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

.note {
  margin-top: 20px;
  padding: 15px;
  background: #fff4e5;
  border-radius: 8px;
  color: #6d3b00;
  line-height: 1.6;
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

placeholder="Example: 7500"

value="${goldPrice || ""}"

required

>


<button type="submit">

Update Only Gold Product Prices

</button>

</form>

</div>


<div class="note">

<b>Important:</b>

<br><br>

• Only <b>Gold</b> variants will be updated.

<br>

• <b>Silver prices will NOT change.</b>

<br>

• Prices change only when you enter a new Gold price and click the button.

<br>

• Otherwise, all existing Shopify prices remain unchanged.

</div>


<div class="price-box">

<b>
Last Entered Gold Price:
</b>

<div class="price">

₹ ${goldPrice || 0}

</div>

</div>

</div>

</body>

</html>

  `);

});


// ==========================================
// UPDATE GOLD PRODUCTS ONLY
// ==========================================

app.post(
  "/update-gold-price",
  async (req, res) => {

    try {


      // ======================================
      // GET GOLD PRICE
      // ======================================

      const newGoldPrice =
        getNumber(req.body.goldPrice);


      if (
        !newGoldPrice ||
        newGoldPrice <= 0
      ) {

        throw new Error(
          "Please enter a valid Gold Price"
        );

      }


      // IMPORTANT:
      // Price changes only after client submits
      goldPrice =
        newGoldPrice;


      console.log(
        "===================================="
      );

      console.log(
        "NEW GOLD PRICE ENTERED:",
        goldPrice
      );

      console.log(
        "===================================="
      );


      // ======================================
      // GET SHOPIFY ACCESS TOKEN
      // ======================================

      const accessToken =
        await getShopifyAccessToken();


      // ======================================
      // GET ALL PRODUCTS
      // ======================================

      let hasNextPage =
        true;

      let cursor =
        null;


      let updatedProducts =
        0;

      let updatedVariants =
        0;

      let silverVariantsSkipped =
        0;

      let skippedProducts =
        0;


      while (hasNextPage) {


        const productsQuery = `

query getProducts(
  $cursor: String
) {

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


        const productsConnection =
          productsData.products;


        const products =
          productsConnection.nodes || [];


        console.log(
          "Products found in page:",
          products.length
        );


        // ======================================
        // LOOP PRODUCTS
        // ======================================

        for (
          const product
          of products
        ) {


          console.log(
            "------------------------------------"
          );

          console.log(
            "CHECKING PRODUCT:",
            product.title
          );


          // ====================================
          // GET GOLD WEIGHT
          // ====================================

          const weightValue =

            product.goldWeight?.value ||

            product.weight?.value ||

            0;


          const goldWeight =
            getNumber(weightValue);


          // ====================================
          // GET MAKING CHARGE
          // ====================================

          const makingChargeValue =

            product.makingCharge?.value ||

            product.makingCharge2?.value ||

            0;


          const makingCharge =
            getNumber(
              makingChargeValue
            );


          // ====================================
          // FIND GOLD VARIANTS ONLY
          // ====================================

          const goldVariants =
            product.variants.nodes.filter(
              variant =>
                isGoldVariant(variant)
            );


          // ====================================
          // COUNT SILVER / OTHER VARIANTS
          // ====================================

          const nonGoldVariants =
            product.variants.nodes.filter(
              variant =>
                !isGoldVariant(variant)
            );


          silverVariantsSkipped +=
            nonGoldVariants.length;


          // ====================================
          // NO GOLD VARIANT = SKIP PRODUCT
          // ====================================

          if (
            goldVariants.length === 0
          ) {

            console.log(
              "SKIPPED - No Gold Variant:",
              product.title
            );

            skippedProducts++;

            continue;

          }


          // ====================================
          // INVALID WEIGHT = SKIP
          // ====================================

          if (
            !Number.isFinite(goldWeight) ||
            goldWeight <= 0
          ) {

            console.log(
              "SKIPPED - Invalid Gold Weight:",
              product.title
            );

            skippedProducts++;

            continue;

          }


          // ====================================
          // CALCULATE PRICE IN INR
          // ====================================

          const priceINR =

            (
              goldPrice *
              goldWeight
            )

            +

            makingCharge;


          // ====================================
          // CONVERT INR TO USD
          // ====================================

          const priceUSD =

            priceINR *
            INR_TO_USD;


          if (
            !Number.isFinite(priceUSD) ||
            priceUSD <= 0
          ) {

            console.log(
              "SKIPPED - Invalid calculated price:",
              product.title
            );

            skippedProducts++;

            continue;

          }


          const finalPrice =
            Number(
              priceUSD.toFixed(2)
            );


          console.log(
            "Gold Weight:",
            goldWeight
          );

          console.log(
            "Making Charge:",
            makingCharge
          );

          console.log(
            "Price INR:",
            priceINR
          );

          console.log(
            "Final Price USD:",
            finalPrice
          );


          // ====================================
          // PREPARE ONLY GOLD VARIANTS
          // ====================================

          const variantsToUpdate =

            goldVariants.map(

              variant => ({

                id:
                  variant.id,

                price:
                  finalPrice.toFixed(2)

              })

            );


          // ====================================
          // UPDATE ONLY GOLD VARIANTS
          // ====================================

          const updateMutation = `

mutation updateVariants(

  $productId: ID!

  $variants:
  [ProductVariantsBulkInput!]!

) {

  productVariantsBulkUpdate(

    productId:
    $productId

    variants:
    $variants

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


          const errors =

            updateData
              .productVariantsBulkUpdate
              .userErrors;


          if (
            errors &&
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


          // ====================================
          // SUCCESS
          // ====================================

          updatedProducts++;

          updatedVariants +=
            variantsToUpdate.length;


          console.log(
            "SUCCESS:"
          );

          console.log(
            "Product:",
            product.title
          );

          console.log(
            "Gold Variants Updated:",
            variantsToUpdate.length
          );

          console.log(
            "Silver Variants NOT Changed:",
            nonGoldVariants.length
          );

        }


        // ======================================
        // NEXT PRODUCT PAGE
        // ======================================

        hasNextPage =
          productsConnection
            .pageInfo
            .hasNextPage;


        cursor =
          productsConnection
            .pageInfo
            .endCursor;

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

  padding: 50px 20px;

  text-align: center;

}

.container {

  max-width: 650px;

  margin: auto;

  background: white;

  padding: 40px;

  border-radius: 15px;

  box-shadow:
    0 4px 20px
    rgba(0,0,0,0.08);

}

.success {

  color: #008060;

  font-size: 30px;

}

.info {

  font-size: 17px;

  line-height: 1.8;

}

.gold {

  color: #b7791f;

  font-weight: bold;

}

.safe {

  color: #008060;

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

${updatedProducts}
Products Updated

</h2>


<div class="info">


<p>

<b>
Gold Variants Updated:
</b>

<span class="gold">

${updatedVariants}

</span>

</p>


<p>

<b>
Silver / Other Variants:
</b>

<span class="safe">

${silverVariantsSkipped}

NOT changed

</span>

</p>


<p>

<b>
Skipped Products:
</b>

${skippedProducts}

</p>


<p>

<b>
Today's Gold Price:
</b>

₹ ${goldPrice}

</p>


<p>

<b>
Currency:
</b>

Automatically converted
from ₹ INR to $ USD

</p>


<hr>


<p class="safe">

✓ Only Gold variants were updated.

</p>

<p class="safe">

✓ Silver prices remain exactly unchanged.

</p>

<p>

Prices will not change again until
a client enters a new Gold price
and clicks Update.

</p>


</div>


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

<head>

<title>
Error
</title>

</head>

<body
style="
font-family: Arial;
padding: 50px;
text-align: center;
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
