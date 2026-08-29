const express = require("express");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// ======================================================
// SETTINGS
// ======================================================

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;

const SHOPIFY_CLIENT_SECRET =
  process.env.SHOPIFY_CLIENT_SECRET;


// પ્રથમ વખત calculation માટેનો જૂનો Gold Rate
// Render માં આ Environment Variable પણ add કરી શકાય
const BASE_GOLD_RATE_INR =
  Number(process.env.BASE_GOLD_RATE_INR || 75000);


// હાલમાં દાખલ કરેલો Gold Rate
let currentGoldPrice = BASE_GOLD_RATE_INR;


// ======================================================
// GET SHOPIFY ACCESS TOKEN
// ======================================================

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


  const shop = SHOPIFY_SHOP
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


  if (!response.ok) {

    console.log("TOKEN ERROR:", data);

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


// ======================================================
// SHOPIFY GRAPHQL REQUEST
// ======================================================

async function shopifyRequest(
  accessToken,
  query,
  variables = {}
) {

  const shop = SHOPIFY_SHOP
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

      body: JSON.stringify({

        query,

        variables

      })

    }

  );


  const data = await response.json();


  if (!response.ok) {

    console.log(
      "SHOPIFY API ERROR:",
      JSON.stringify(data, null, 2)
    );

    throw new Error(
      "Shopify API connection failed"
    );

  }


  if (data.errors) {

    console.log(
      "GRAPHQL ERRORS:",
      JSON.stringify(data.errors, null, 2)
    );

    throw new Error(
      data.errors[0].message
    );

  }


  return data.data;

}


// ======================================================
// CHECK IF VARIANT IS GOLD
// ======================================================

function isGoldVariant(variant) {

  if (!variant.selectedOptions) {
    return false;
  }


  return variant.selectedOptions.some(option => {

    const optionName =
      String(option.name || "")
        .toLowerCase()
        .trim();


    const optionValue =
      String(option.value || "")
        .toLowerCase()
        .trim();


    // તમારા Shopify માં:
    // Metal Type = Gold / Silver

    const isMetalOption =
      optionName.includes("metal");


    const isGold =
      optionValue === "gold";


    return isMetalOption && isGold;

  });

}


// ======================================================
// HOME PAGE
// ======================================================

app.get("/", (req, res) => {

  res.send(`

<!DOCTYPE html>

<html>

<head>

<title>Gold Price Updater</title>

<meta name="viewport"
content="width=device-width, initial-scale=1">

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

  padding:
    40px 20px;

}

.container {

  max-width:
    700px;

  margin:
    auto;

  background:
    white;

  padding:
    35px;

  border-radius:
    15px;

  box-shadow:
    0 4px 25px
    rgba(0,0,0,0.08);

}

h1 {

  margin-top: 0;

  color:
    #202223;

}

.card {

  background:
    #f6f6f7;

  padding:
    25px;

  border-radius:
    12px;

  margin-top:
    20px;

}

label {

  display:
    block;

  font-weight:
    bold;

  margin-bottom:
    10px;

}

input {

  width:
    100%;

  padding:
    15px;

  font-size:
    18px;

  border:
    1px solid #babfc3;

  border-radius:
    8px;

  margin-bottom:
    15px;

}

button {

  width:
    100%;

  background:
    #008060;

  color:
    white;

  border:
    none;

  padding:
    15px;

  font-size:
    17px;

  border-radius:
    8px;

  cursor:
    pointer;

}

.info {

  margin-top:
    25px;

  padding:
    18px;

  background:
    #e3f1df;

  border-radius:
    10px;

  line-height:
    1.7;

}

.warning {

  margin-top:
    20px;

  font-size:
    14px;

  color:
    #616161;

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
Today's Gold Rate (₹)
</label>

<input

type="number"

step="0.01"

name="goldPrice"

placeholder="Example: 80000"

value="${currentGoldPrice}"

required

>

<button type="submit">

Update ALL Gold Product Prices

</button>

</form>

</div>


<div class="info">

<strong>
Current Gold Rate:
</strong>

<br>

₹ ${currentGoldPrice}

</div>


<div class="warning">

✅ Only GOLD variants will change.

<br>

❌ SILVER variants will remain exactly the same.

<br>

💵 Shopify prices will remain in USD ($).

</div>

</div>

</body>

</html>

  `);

});


// ======================================================
// UPDATE ALL GOLD PRODUCTS
// ======================================================

app.post(

  "/update-gold-price",

  async (req, res) => {

    try {


      // ==================================================
      // GET NEW GOLD PRICE
      // ==================================================

      const newGoldPrice =
        Number(req.body.goldPrice);


      if (
        !newGoldPrice ||
        newGoldPrice <= 0
      ) {

        throw new Error(
          "Please enter a valid Gold Price"
        );

      }


      console.log("");
      console.log("================================");
      console.log("NEW GOLD RATE:", newGoldPrice);
      console.log("================================");


      // ==================================================
      // GET SHOPIFY TOKEN
      // ==================================================

      const accessToken =
        await getShopifyAccessToken();


      console.log(
        "Shopify token generated successfully"
      );


      // ==================================================
      // GRAPHQL QUERY
      // ==================================================

      const productsQuery = `

query getProducts($cursor: String) {

  products(
    first: 50
    after: $cursor
  ) {

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

          lastGoldRate: metafield(
            namespace: "custom"
            key: "last_gold_rate"
          ) {

            id

            value

          }

        }

      }

    }

  }

}

      `;


      // ==================================================
      // MUTATION FOR UPDATING VARIANTS
      // ==================================================

      const updateVariantsMutation = `

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


      // ==================================================
      // METAFIELD SAVE MUTATION
      // ==================================================

      const saveRateMutation = `

mutation saveGoldRate(
  $metafields: [MetafieldsSetInput!]!
) {

  metafieldsSet(
    metafields: $metafields
  ) {

    metafields {

      id

      key

      value

    }

    userErrors {

      field

      message

      code

    }

  }

}

      `;


      // ==================================================
      // COUNTERS
      // ==================================================

      let totalProducts = 0;

      let updatedProducts = 0;

      let updatedVariants = 0;

      let silverVariants = 0;

      let skippedVariants = 0;


      let cursor = null;

      let hasNextPage = true;


      // ==================================================
      // LOOP THROUGH ALL SHOPIFY PRODUCTS
      // ==================================================

      while (hasNextPage) {


        const productsData =
          await shopifyRequest(

            accessToken,

            productsQuery,

            {

              cursor

            }

          );


        const products =
          productsData.products.nodes;


        const pageInfo =
          productsData.products.pageInfo;


        console.log(
          "Products in this page:",
          products.length
        );


        // ================================================
        // LOOP PRODUCTS
        // ================================================

        for (
          const product
          of products
        ) {


          totalProducts++;


          console.log("");
          console.log(
            "CHECKING PRODUCT:",
            product.title
          );


          const variantsToUpdate = [];

          const metafieldsToSave = [];


          // ==============================================
          // LOOP VARIANTS
          // ==============================================

          for (
            const variant
            of product.variants.nodes
          ) {


            // ============================================
            // CHECK GOLD
            // ============================================

            if (!isGoldVariant(variant)) {


              const hasSilver =
                variant.selectedOptions.some(
                  option =>

                    String(option.value || "")
                      .toLowerCase()
                      .trim() === "silver"
                );


              if (hasSilver) {

                silverVariants++;

              } else {

                skippedVariants++;

              }


              continue;

            }


            // ============================================
            // GET CURRENT PRICE
            // ============================================

            const currentPrice =
              Number(variant.price);


            if (
              !currentPrice ||
              currentPrice <= 0
            ) {

              console.log(
                "SKIPPED INVALID PRICE:",
                variant.id
              );

              skippedVariants++;

              continue;

            }


            // ============================================
            // GET OLD GOLD RATE
            // ============================================

            let oldGoldRate =
              BASE_GOLD_RATE_INR;


            if (
              variant.lastGoldRate &&
              Number(variant.lastGoldRate.value) > 0
            ) {

              oldGoldRate =
                Number(
                  variant.lastGoldRate.value
                );

            }


            // ============================================
            // CALCULATE PRICE RATIO
            //
            // Example:
            //
            // Old Rate = ₹75,000
            // New Rate = ₹80,000
            //
            // $4,500 × 80000 / 75000
            //
            // = $4,800
            // ============================================

            const priceRatio =
              newGoldPrice /
              oldGoldRate;


            const newPrice =
              Number(

                (
                  currentPrice *
                  priceRatio

                ).toFixed(2)

              );


            console.log(
              "GOLD VARIANT FOUND"
            );

            console.log(
              "OLD GOLD RATE:",
              oldGoldRate
            );

            console.log(
              "NEW GOLD RATE:",
              newGoldPrice
            );

            console.log(
              "OLD USD PRICE:",
              currentPrice
            );

            console.log(
              "NEW USD PRICE:",
              newPrice
            );


            // ============================================
            // ADD VARIANT FOR PRICE UPDATE
            // ============================================

            variantsToUpdate.push({

              id:
                variant.id,

              price:
                newPrice.toFixed(2)

            });


            // ============================================
            // SAVE NEW GOLD RATE
            // ============================================

            metafieldsToSave.push({

              ownerId:
                variant.id,

              namespace:
                "custom",

              key:
                "last_gold_rate",

              type:
                "number_decimal",

              value:
                String(newGoldPrice)

            });

          }


          // ==============================================
          // UPDATE GOLD VARIANTS ONLY
          // ==============================================

          if (
            variantsToUpdate.length === 0
          ) {

            continue;

          }


          const updateData =
            await shopifyRequest(

              accessToken,

              updateVariantsMutation,

              {

                productId:
                  product.id,

                variants:
                  variantsToUpdate

              }

            );


          const updateErrors =
            updateData
              .productVariantsBulkUpdate
              .userErrors;


          if (
            updateErrors.length > 0
          ) {

            console.log(
              "UPDATE ERROR:",
              product.title,
              updateErrors
            );

            continue;

          }


          // ==============================================
          // SAVE LAST GOLD RATE
          // ==============================================

          const saveData =
            await shopifyRequest(

              accessToken,

              saveRateMutation,

              {

                metafields:
                  metafieldsToSave

              }

            );


          const metafieldErrors =
            saveData
              .metafieldsSet
              .userErrors;


          if (
            metafieldErrors.length > 0
          ) {

            console.log(
              "METAFIELD SAVE ERROR:",
              metafieldErrors
            );

          }


          updatedProducts++;

          updatedVariants +=
            variantsToUpdate.length;


          console.log(
            "SUCCESS:",
            product.title
          );

        }


        // ================================================
        // PAGINATION
        // ================================================

        hasNextPage =
          pageInfo.hasNextPage;


        cursor =
          pageInfo.endCursor;


      }


      // ==================================================
      // SAVE CURRENT RATE
      // ==================================================

      currentGoldPrice =
        newGoldPrice;


      // ==================================================
      // SUCCESS PAGE
      // ==================================================

      res.send(`

<!DOCTYPE html>

<html>

<head>

<title>Products Updated</title>

<meta name="viewport"
content="width=device-width, initial-scale=1">

<style>

body {

  font-family:
    Arial,
    sans-serif;

  background:
    #f6f6f7;

  padding:
    40px 20px;

  text-align:
    center;

}

.container {

  max-width:
    650px;

  margin:
    auto;

  background:
    white;

  padding:
    40px;

  border-radius:
    15px;

  box-shadow:
    0 4px 25px
    rgba(0,0,0,0.08);

}

.success {

  color:
    #008060;

  font-size:
    30px;

}

.stat {

  margin:
    12px;

  font-size:
    17px;

}

a {

  display:
    inline-block;

  margin-top:
    25px;

  padding:
    14px 30px;

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

<h1 class="success">

✅ Products Updated Successfully!

</h1>


<h2>

${updatedProducts}
Products Updated

</h2>


<div class="stat">

<strong>
Total Products Checked:
</strong>

${totalProducts}

</div>


<div class="stat">

<strong>
Gold Variants Updated:
</strong>

${updatedVariants}

</div>


<div class="stat">

<strong>
Silver Variants NOT Changed:
</strong>

${silverVariants}

</div>


<div class="stat">

<strong>
Today's Gold Rate:
</strong>

₹ ${newGoldPrice}

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

<title>Error Updating Products</title>

</head>

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


// ======================================================
// SERVER
// ======================================================

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
