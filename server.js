const express = require("express");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let goldPrice = 0;


// ==========================================
// SHOPIFY SETTINGS
// ==========================================

const SHOPIFY_STORE =
  process.env.SHOPIFY_STORE;

const SHOPIFY_ACCESS_TOKEN =
  process.env.SHOPIFY_ACCESS_TOKEN;

const INR_TO_USD =
  Number(process.env.INR_TO_USD || 0.012);


// ==========================================
// FIX SHOPIFY STORE URL
// ==========================================

function getShopifyStore() {

  if (!SHOPIFY_STORE) {
    return null;
  }

  let store = SHOPIFY_STORE
    .trim()
    .replace("https://", "")
    .replace("http://", "")
    .replace("/", "");

  // જો માત્ર store name હોય તો
  if (!store.includes(".myshopify.com")) {
    store = store + ".myshopify.com";
  }

  return store;
}


// ==========================================
// HOME PAGE
// DESIGN SAME
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

<form action="/update-gold-price" method="POST">

<label>Today's Gold Price</label>

<input
type="number"
step="0.01"
name="goldPrice"
placeholder="Enter today's gold price"
value="${goldPrice || ""}"
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
₹ ${goldPrice}
</div>

</div>

</div>

</body>

</html>

  `);

});


// ==========================================
// GET ALL PRODUCTS
// ==========================================

async function getAllProducts(store) {

  let products = [];

  let url =
    `https://${store}/admin/api/2025-01/products.json?limit=250`;

  while (url) {

    const response = await fetch(url, {

      headers: {

        "X-Shopify-Access-Token":
          SHOPIFY_ACCESS_TOKEN,

        "Content-Type":
          "application/json"

      }

    });

    if (!response.ok) {

      const errorText =
        await response.text();

      console.log(
        "SHOPIFY API ERROR:",
        response.status,
        errorText
      );

      throw new Error(
        `Shopify API Error (${response.status}): ${errorText}`
      );

    }

    const data =
      await response.json();

    products =
      products.concat(data.products || []);


    // Pagination માટે
    const linkHeader =
      response.headers.get("link");

    let nextUrl = null;

    if (linkHeader) {

      const links =
        linkHeader.split(",");

      for (const link of links) {

        if (link.includes('rel="next"')) {

          const match =
            link.match(/<([^>]+)>/);

          if (match) {
            nextUrl = match[1];
          }

        }

      }

    }

    url = nextUrl;

  }

  return products;

}


// ==========================================
// UPDATE ALL GOLD PRODUCTS
// ==========================================

app.post(
  "/update-gold-price",
  async (req, res) => {

    try {

      goldPrice =
        Number(req.body.goldPrice);


      // ======================================
      // VALIDATE PRICE
      // ======================================

      if (!goldPrice || goldPrice <= 0) {

        return res.send(`

<!DOCTYPE html>
<html>

<body style="
font-family:Arial;
background:#f6f6f7;
padding:50px;
text-align:center;
">

<h1>❌ Please enter a valid Gold Price</h1>

<a href="/">← Go Back</a>

</body>

</html>

        `);

      }


      // ======================================
      // CHECK SETTINGS
      // ======================================

      const store =
        getShopifyStore();


      if (!store) {

        throw new Error(
          "SHOPIFY_STORE is missing in Render Environment Variables."
        );

      }


      if (!SHOPIFY_ACCESS_TOKEN) {

        throw new Error(
          "SHOPIFY_ACCESS_TOKEN is missing in Render Environment Variables."
        );

      }


      console.log(
        "================================"
      );

      console.log(
        "SHOPIFY STORE:",
        store
      );

      console.log(
        "Today's Gold Price:",
        goldPrice
      );

      console.log(
        "================================"
      );


      // ======================================
      // GET ALL PRODUCTS
      // ======================================

      const products =
        await getAllProducts(store);


      console.log(
        "Total Products Found:",
        products.length
      );


      let updatedProducts = 0;

      let updatedVariants = 0;

      let skippedProducts = 0;


      // ======================================
      // LOOP THROUGH PRODUCTS
      // ======================================

      for (const product of products) {


        try {


          // ==================================
          // GET PRODUCT METAFIELDS
          // ==================================

          const metafieldsResponse =
            await fetch(

              `https://${store}/admin/api/2025-01/products/${product.id}/metafields.json`,

              {

                headers: {

                  "X-Shopify-Access-Token":
                    SHOPIFY_ACCESS_TOKEN,

                  "Content-Type":
                    "application/json"

                }

              }

            );


          if (!metafieldsResponse.ok) {

            console.log(
              "Could not get metafields:",
              product.title
            );

            skippedProducts++;

            continue;

          }


          const metafieldsData =
            await metafieldsResponse.json();


          const metafields =
            metafieldsData.metafields || [];


          // ==================================
          // FIND GOLD WEIGHT
          // ==================================

          const weightField =
            metafields.find(

              item =>

                item.namespace === "custom" &&

                (

                  item.key === "gold_weight" ||

                  item.key === "weight"

                )

            );


          // ==================================
          // FIND MAKING CHARGE
          // ==================================

          const makingField =
            metafields.find(

              item =>

                item.namespace === "custom" &&

                (

                  item.key === "making_charge" ||

                  item.key === "makingcharge"

                )

            );


          // ==================================
          // SKIP IF NO GOLD WEIGHT
          // ==================================

          if (!weightField) {

            console.log(
              "Skipped - No Gold Weight:",
              product.title
            );

            skippedProducts++;

            continue;

          }


          // ==================================
          // GET VALUES
          // ==================================

          const goldWeight =
            Number(weightField.value);


          const makingCharge =
            makingField
              ? Number(makingField.value)
              : 0;


          // ==================================
          // CALCULATE PRICE IN INR
          // ==================================

          const priceINR =

            (goldPrice * goldWeight)

            +

            makingCharge;


          // ==================================
          // CONVERT INR TO USD
          // ==================================

          const priceUSD =

            priceINR * INR_TO_USD;


          const finalPrice =
            Number(
              priceUSD.toFixed(2)
            );


          console.log(
            "Product:",
            product.title
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
            "Final USD Price:",
            finalPrice
          );


          // ==================================
          // UPDATE ALL VARIANTS
          // ==================================

          for (
            const variant
            of product.variants
          ) {


            const updateResponse =
              await fetch(

                `https://${store}/admin/api/2025-01/variants/${variant.id}.json`,

                {

                  method: "PUT",

                  headers: {

                    "X-Shopify-Access-Token":
                      SHOPIFY_ACCESS_TOKEN,

                    "Content-Type":
                      "application/json"

                  },

                  body:

                    JSON.stringify({

                      variant: {

                        id:
                          variant.id,

                        price:
                          finalPrice.toFixed(2)

                      }

                    })

                }

              );


            if (!updateResponse.ok) {

              const errorText =
                await updateResponse.text();


              console.log(
                "VARIANT UPDATE ERROR"
              );

              console.log(
                "Product:",
                product.title
              );

              console.log(
                "Variant:",
                variant.id
              );

              console.log(
                errorText
              );


            } else {

              updatedVariants++;

            }


          }


          updatedProducts++;


          console.log(
            "✅ UPDATED:",
            product.title
          );


        }

        catch (productError) {

          console.log(
            "PRODUCT ERROR:",
            product.title,
            productError.message
          );

          skippedProducts++;

        }


      }


      // ======================================
      // SUCCESS PAGE
      // ======================================

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

border-radius: 12px;

box-shadow:
0 4px 20px rgba(0,0,0,0.08);

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

${updatedProducts} Products Updated

</h2>

<p>

<strong>
${updatedVariants}
Variants Updated
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

<p>

All eligible Gold product prices have been updated.

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
        "MAIN ERROR:",
        error
      );


      res.send(`

<!DOCTYPE html>

<html>

<head>

<title>Error Updating Products</title>

<style>

body {

font-family: Arial;

background: #f6f6f7;

padding: 50px;

text-align: center;

}

.container {

max-width: 700px;

margin: auto;

background: white;

padding: 40px;

border-radius: 12px;

}

.error {

color: #d72c0d;

font-size: 28px;

}

.message {

margin-top: 20px;

padding: 20px;

background: #fff4f4;

border-radius: 8px;

color: #d72c0d;

word-break: break-word;

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

<h1 class="error">

❌ Error Updating Products

</h1>

<div class="message">

${error.message}

</div>

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


// ==========================================
// SERVER
// ==========================================

const PORT =
  process.env.PORT || 10000;


app.listen(PORT, () => {

  console.log(
    "Gold Price Updater running on port " + PORT
  );

});
