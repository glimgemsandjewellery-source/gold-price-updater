const express = require("express");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// =====================================================
// SHOPIFY SETTINGS
// =====================================================

const SHOPIFY_SHOP =
  process.env.SHOPIFY_SHOP;

const SHOPIFY_CLIENT_ID =
  process.env.SHOPIFY_CLIENT_ID;

const SHOPIFY_CLIENT_SECRET =
  process.env.SHOPIFY_CLIENT_SECRET;


// =====================================================
// INR TO USD
// =====================================================

// Change this in Render Environment Variable if needed
const INR_TO_USD =
  Number(process.env.INR_TO_USD || 0.012);


// =====================================================
// CURRENT GOLD PRICE
// =====================================================

// IMPORTANT:
// Server starts with ₹0
let goldPrice = 0;


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

  const number = Number(
    String(value)
      .replace(/,/g, "")
      .replace(/[₹$]/g, "")
      .trim()
  );

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
      "SHOPIFY_SHOP is missing"
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
//
// NO SHOPIFY_ACCESS_TOKEN VARIABLE NEEDED
//
// Uses:
// SHOPIFY_SHOP
// SHOPIFY_CLIENT_ID
// SHOPIFY_CLIENT_SECRET
//
// =====================================================

async function getShopifyAccessToken() {

  if (
    !SHOPIFY_SHOP ||
    !SHOPIFY_CLIENT_ID ||
    !SHOPIFY_CLIENT_SECRET
  ) {

    throw new Error(
      "SHOPIFY_SHOP, SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET is missing"
    );

  }

  const shop = getShopName();

  const response = await fetch(
    `https://${shop}.myshopify.com/admin/oauth/access_token`,
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
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {

    console.log(
      "SHOPIFY TOKEN ERROR:",
      JSON.stringify(data, null, 2)
    );

    throw new Error(
      data.error_description ||
      data.error ||
      "Unable to connect to Shopify"
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

      body: JSON.stringify({
        query,
        variables
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {

    console.log(
      "SHOPIFY HTTP ERROR:",
      JSON.stringify(data, null, 2)
    );

    throw new Error(
      data?.errors?.[0]?.message ||
      "Shopify API request failed"
    );

  }

  if (data.errors) {

    console.log(
      "SHOPIFY GRAPHQL ERROR:",
      JSON.stringify(data.errors, null, 2)
    );

    throw new Error(
      data.errors[0].message
    );

  }

  return data.data;

}


// =====================================================
// CHECK IF VARIANT IS GOLD
// =====================================================

function isGoldVariant(variant) {

  const options =
    variant.selectedOptions || [];


  // Check variant options
  for (const option of options) {

    const optionName =
      String(option.name || "")
        .trim()
        .toLowerCase();

    const optionValue =
      String(option.value || "")
        .trim()
        .toLowerCase();


    const metalOptionNames = [

      "metal",
      "metal type",
      "metaltype",
      "material"

    ];


    if (
      metalOptionNames.includes(optionName) &&
      optionValue.includes("gold")
    ) {
      return true;
    }

  }


  // Extra fallback:
  // If variant title itself contains GOLD
  const variantTitle =
    String(variant.title || "")
      .toLowerCase();


  if (
    variantTitle.includes("gold") &&
    !variantTitle.includes("silver")
  ) {
    return true;
  }


  return false;

}


// =====================================================
// GET METAFIELD VALUE
// =====================================================

function metafieldValue(metafield) {

  if (!metafield) {
    return 0;
  }

  return getNumber(
    metafield.value
  );

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

<title>
Gold Price Updater
</title>


<style>

* {
  box-sizing: border-box;
}

body {

  margin: 0;

  min-height: 100vh;

  font-family:
    Arial,
    sans-serif;

  background:
    #f5f5f7;

  padding:
    80px
    20px;

}


.container {

  width: 100%;

  max-width:
    680px;

  margin:
    auto;

  background:
    #ffffff;

  padding:
    35px;

  border-radius:
    18px;

  box-shadow:
    0 8px 30px
    rgba(
      0,
      0,
      0,
      0.08
    );

}


h1 {

  margin:
    0
    0
    25px;

  color:
    #202223;

  font-size:
    34px;

}


.card {

  background:
    #f1f1f3;

  padding:
    25px;

  border-radius:
    14px;

}


label {

  display:
    block;

  font-size:
    16px;

  font-weight:
    700;

  color:
    #202223;

  margin-bottom:
    12px;

}


input {

  width:
    100%;

  height:
    55px;

  padding:
    12px
    15px;

  font-size:
    18px;

  border:
    1px solid
    #babfc3;

  border-radius:
    10px;

  outline:
    none;

}


input:focus {

  border-color:
    #008060;

}


button {

  width:
    100%;

  margin-top:
    15px;

  height:
    55px;

  border:
    none;

  border-radius:
    8px;

  background:
    #008060;

  color:
    white;

  font-size:
    16px;

  font-weight:
    600;

  cursor:
    pointer;

}


button:hover {

  background:
    #006e52;

}


.price-box {

  margin-top:
    25px;

  padding:
    22px;

  border-radius:
    12px;

  background:
    #e3f1df;

}


.price-label {

  font-size:
    16px;

  font-weight:
    bold;

  color:
    #202223;

}


.price {

  margin-top:
    8px;

  font-size:
    30px;

  font-weight:
    bold;

  color:
    #008060;

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

Today's Gold Price
(₹ Per Gram)

</label>


<input

type="number"

step="0.01"

min="0"

name="goldPrice"

placeholder="Enter today's Gold price"

required

>


<button type="submit">

Update All Gold Product Prices

</button>


</form>


</div>



<div class="price-box">


<div class="price-label">

Current Gold Price:

</div>


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


      // ================================================
      // GET NEW GOLD PRICE
      // ================================================

      const newGoldPrice =
        getNumber(
          req.body.goldPrice
        );


      if (
        !newGoldPrice ||
        newGoldPrice <= 0
      ) {

        throw new Error(
          "Please enter a valid Gold Price"
        );

      }


      goldPrice =
        newGoldPrice;


      console.log("");
      console.log("======================================");
      console.log("NEW GOLD PRICE:", goldPrice);
      console.log("======================================");
      console.log("");


      // ================================================
      // GET ACCESS TOKEN
      // ================================================

      const accessToken =
        await getShopifyAccessToken();


      // ================================================
      // COUNTERS
      // ================================================

      let updatedProducts = 0;

      let updatedVariants = 0;

      let goldVariantsFound = 0;

      let silverVariantsSkipped = 0;

      let skippedProducts = 0;

      let skippedGoldVariants = 0;


      // ================================================
      // PAGINATION
      // ================================================

      let hasNextPage = true;

      let cursor = null;


      // ================================================
      // LOOP ALL PRODUCT PAGES
      // ================================================

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


      productGoldWeight:
      metafield(
        namespace: "custom"
        key: "gold_weight"
      ) {
        value
      }


      productWeight:
      metafield(
        namespace: "custom"
        key: "weight"
      ) {
        value
      }


      productMakingCharge:
      metafield(
        namespace: "custom"
        key: "making_charge"
      ) {
        value
      }


      productMakingCharge2:
      metafield(
        namespace: "custom"
        key: "makingcharge"
      ) {
        value
      }


      variants(
        first: 250
      ) {

        nodes {

          id

          title

          price


          selectedOptions {

            name

            value

          }


          goldWeight:
          metafield(
            namespace: "custom"
            key: "gold_weight"
          ) {
            value
          }


          weightMetafield:
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
          "PRODUCTS FOUND:",
          products.length
        );


        // ==============================================
        // LOOP EVERY PRODUCT
        // ==============================================

        for (
          const product
          of products
        ) {


          console.log("");
          console.log("--------------------------------------");
          console.log("PRODUCT:", product.title);
          console.log("--------------------------------------");


          const variants =
            product.variants.nodes || [];


          const variantsToUpdate = [];


          // ============================================
          // PRODUCT LEVEL WEIGHT
          // ============================================

          const productGoldWeight =

            metafieldValue(
              product.productGoldWeight
            )

            ||

            metafieldValue(
              product.productWeight
            );


          // ============================================
          // PRODUCT LEVEL MAKING CHARGE
          // ============================================

          const productMakingCharge =

            metafieldValue(
              product.productMakingCharge
            )

            ||

            metafieldValue(
              product.productMakingCharge2
            );


          // ============================================
          // CHECK EVERY VARIANT
          // ============================================

          for (
            const variant
            of variants
          ) {


            // ==========================================
            // NOT GOLD = DO NOT CHANGE
            // ==========================================

            if (!isGoldVariant(variant)) {

              silverVariantsSkipped++;

              console.log(
                "NOT GOLD - SKIPPED:",
                variant.title
              );

              continue;

            }


            goldVariantsFound++;


            // ==========================================
            // VARIANT WEIGHT
            // ==========================================

            const variantGoldWeight =

              metafieldValue(
                variant.goldWeight
              )

              ||

              metafieldValue(
                variant.weightMetafield
              );


            // Variant weight first
            // Product weight as fallback

            const finalGoldWeight =

              variantGoldWeight

              ||

              productGoldWeight;


            // ==========================================
            // VARIANT MAKING CHARGE
            // ==========================================

            const variantMakingCharge =

              metafieldValue(
                variant.makingCharge
              )

              ||

              metafieldValue(
                variant.makingCharge2
              );


            // Variant making charge first
            // Product making charge as fallback

            const finalMakingCharge =

              variantMakingCharge

              ||

              productMakingCharge;


            // ==========================================
            // NO WEIGHT = SKIP ONLY THIS VARIANT
            // ==========================================

            if (
              !finalGoldWeight ||
              finalGoldWeight <= 0
            ) {

              console.log(
                "GOLD VARIANT SKIPPED - NO WEIGHT:",
                variant.title
              );

              skippedGoldVariants++;

              continue;

            }


            // ==========================================
            // CALCULATE INR PRICE
            // ==========================================

            const priceINR =

              (
                goldPrice *
                finalGoldWeight
              )

              +

              finalMakingCharge;


            // ==========================================
            // CONVERT INR TO USD
            // ==========================================

            const priceUSD =

              priceINR *
              INR_TO_USD;


            if (
              !Number.isFinite(priceUSD) ||
              priceUSD <= 0
            ) {

              console.log(
                "INVALID PRICE:",
                variant.title
              );

              skippedGoldVariants++;

              continue;

            }


            const finalPrice =
              Number(
                priceUSD.toFixed(2)
              );


            console.log(
              "GOLD VARIANT:",
              variant.title
            );

            console.log(
              "GOLD WEIGHT:",
              finalGoldWeight
            );

            console.log(
              "MAKING CHARGE:",
              finalMakingCharge
            );

            console.log(
              "FINAL USD PRICE:",
              finalPrice
            );


            // ==========================================
            // ADD VARIANT TO UPDATE LIST
            // ==========================================

            variantsToUpdate.push({

              id:
                variant.id,

              price:
                finalPrice.toFixed(2)

            });

          }


          // ============================================
          // NO VALID GOLD VARIANTS
          // ============================================

          if (
            variantsToUpdate.length === 0
          ) {

            skippedProducts++;

            console.log(
              "NO VALID GOLD VARIANTS TO UPDATE"
            );

            continue;

          }


          // ============================================
          // UPDATE ALL GOLD VARIANTS OF THIS PRODUCT
          // ============================================

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


          const userErrors =

            updateData
              .productVariantsBulkUpdate
              .userErrors;


          if (
            userErrors &&
            userErrors.length > 0
          ) {

            console.log(
              "UPDATE ERRORS:",
              JSON.stringify(
                userErrors,
                null,
                2
              )
            );

            skippedProducts++;

            continue;

          }


          // ============================================
          // SUCCESS
          // ============================================

          updatedProducts++;

          updatedVariants +=
            variantsToUpdate.length;


          console.log(
            "SUCCESSFULLY UPDATED:",
            product.title
          );


        }


        // ==============================================
        // NEXT PAGE
        // ==============================================

        hasNextPage =
          productsConnection
            .pageInfo
            .hasNextPage;


        cursor =
          productsConnection
            .pageInfo
            .endCursor;


      }


      // =================================================
      // SUCCESS PAGE
      // =================================================

      res.send(`

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>
Products Updated
</title>


<style>

body {

  font-family:
    Arial,
    sans-serif;

  background:
    #f5f5f7;

  margin: 0;

  padding:
    60px
    20px;

  text-align:
    center;

}


.container {

  max-width:
    700px;

  margin:
    auto;

  background:
    white;

  padding:
    40px;

  border-radius:
    18px;

  box-shadow:
    0 8px 30px
    rgba(0,0,0,0.08);

}


h1 {

  color:
    #008060;

}


.info {

  font-size:
    17px;

  line-height:
    2;

}


.green {

  color:
    #008060;

  font-weight:
    bold;

}


.gold {

  color:
    #b7791f;

  font-weight:
    bold;

}


a {

  display:
    inline-block;

  margin-top:
    25px;

  padding:
    14px
    28px;

  background:
    #008060;

  color:
    white;

  text-decoration:
    none;

  border-radius:
    8px;

}

</style>

</head>


<body>


<div class="container">


<h1>

✅ Gold Prices Updated Successfully!

</h1>


<div class="info">


<p>

<b>Products Updated:</b>

<span class="green">

${updatedProducts}

</span>

</p>


<p>

<b>Gold Variants Updated:</b>

<span class="gold">

${updatedVariants}

</span>

</p>


<p>

<b>Total Gold Variants Found:</b>

${goldVariantsFound}

</p>


<p>

<b>Silver / Other Variants NOT Changed:</b>

${silverVariantsSkipped}

</p>


<p>

<b>Gold Variants Skipped (No Weight):</b>

${skippedGoldVariants}

</p>


<p>

<b>Skipped Products:</b>

${skippedProducts}

</p>


<p>

<b>Today's Gold Price:</b>

₹ ${goldPrice}

</p>


<p>

<b>INR to USD Rate:</b>

${INR_TO_USD}

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


      console.error("");
      console.error("======================================");
      console.error("ERROR UPDATING PRODUCTS");
      console.error(error);
      console.error("======================================");
      console.error("");


      res.status(500).send(`

<!DOCTYPE html>

<html>

<head>

<title>
Error Updating Products
</title>

</head>


<body
style="
font-family:Arial;
padding:50px;
text-align:center;
background:#f5f5f7;
"
>


<h1>

❌ Error Updating Products

</h1>


<p>

${String(error.message)}

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
      "======================================"
    );

    console.log(
      "Gold Price Updater running on port " +
      PORT
    );

    console.log(
      "======================================"
    );

  }
);
