const express = require("express");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// ==========================================
// SETTINGS
// ==========================================

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// INR to USD Conversion
const INR_TO_USD = Number(process.env.INR_TO_USD || 0.012);


// ==========================================
// CURRENT PRICES
// ==========================================

let goldPrice = 0;
let silverPrice = 0;


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

<label>Today's Gold Price (₹ Per Gram)</label>

<input
type="number"
step="0.01"
name="goldPrice"
placeholder="Example: 7500"
value="${goldPrice}"
required
>


<label>Today's Silver Price (₹ Per Gram)</label>

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

app.post("/update-prices", async (req, res) => {

  try {

    goldPrice = Number(req.body.goldPrice);
    silverPrice = Number(req.body.silverPrice);


    // ==========================================
    // VALIDATION
    // ==========================================

    if (!goldPrice || goldPrice <= 0) {

      return res.send(`
        <h1>❌ Invalid Gold Price</h1>
        <a href="/">Go Back</a>
      `);

    }


    if (!silverPrice || silverPrice <= 0) {

      return res.send(`
        <h1>❌ Invalid Silver Price</h1>
        <a href="/">Go Back</a>
      `);

    }


    // ==========================================
    // SHOPIFY SETTINGS CHECK
    // ==========================================

    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {

      return res.send(`
        <h1>❌ Shopify Settings Missing</h1>

        <p>
        Please add SHOPIFY_STORE and
        SHOPIFY_ACCESS_TOKEN in Render Environment Variables.
        </p>

        <a href="/">← Go Back</a>
      `);

    }


    console.log("Gold Price:", goldPrice);
    console.log("Silver Price:", silverPrice);


    // ==========================================
    // GET ALL PRODUCTS
    // ==========================================

    const productsResponse = await fetch(

      `https://${SHOPIFY_STORE}/admin/api/2025-01/products.json?limit=250`,

      {

        headers: {

          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,

          "Content-Type": "application/json"

        }

      }

    );


    if (!productsResponse.ok) {

      const errorText = await productsResponse.text();

      console.log("Shopify Error:", errorText);

      throw new Error(
        "Unable to connect to Shopify API"
      );

    }


    const data = await productsResponse.json();

    const products = data.products || [];


    let updatedProducts = 0;
    let skippedProducts = 0;


    // ==========================================
    // LOOP PRODUCTS
    // ==========================================

    for (const product of products) {


      // ==========================================
      // GET PRODUCT METAFIELDS
      // ==========================================

      const metafieldsResponse = await fetch(

        `https://${SHOPIFY_STORE}/admin/api/2025-01/products/${product.id}/metafields.json`,

        {

          headers: {

            "X-Shopify-Access-Token":
              SHOPIFY_ACCESS_TOKEN

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


      // ==========================================
      // FIND GOLD WEIGHT
      // ==========================================

      const goldWeightField =
        metafields.find(

          item =>

            item.namespace === "custom" &&

            (
              item.key === "gold_weight" ||
              item.key === "goldweight"
            )

        );


      // ==========================================
      // FIND SILVER WEIGHT
      // ==========================================

      const silverWeightField =
        metafields.find(

          item =>

            item.namespace === "custom" &&

            (
              item.key === "silver_weight" ||
              item.key === "silverweight"
            )

        );


      // ==========================================
      // FIND MAKING CHARGE
      // ==========================================

      const makingField =
        metafields.find(

          item =>

            item.namespace === "custom" &&

            (
              item.key === "making_charge" ||
              item.key === "makingcharge"
            )

        );


      // ==========================================
      // VALUES
      // ==========================================

      const goldWeight =
        goldWeightField
          ? Number(goldWeightField.value)
          : 0;


      const silverWeight =
        silverWeightField
          ? Number(silverWeightField.value)
          : 0;


      const makingCharge =
        makingField
          ? Number(makingField.value)
          : 0;


      // ==========================================
      // NO GOLD OR SILVER WEIGHT
      // ==========================================

      if (goldWeight <= 0 && silverWeight <= 0) {

        console.log(
          "Skipped - No Gold/Silver Weight:",
          product.title
        );

        skippedProducts++;

        continue;

      }


      // ==========================================
      // PRICE CALCULATION IN INR
      // ==========================================

      const goldTotal =
        goldPrice * goldWeight;


      const silverTotal =
        silverPrice * silverWeight;


      const priceINR =
        goldTotal +
        silverTotal +
        makingCharge;


      // ==========================================
      // INR TO USD
      // ==========================================

      const priceUSD =
        priceINR * INR_TO_USD;


      const finalPrice =
        Number(priceUSD.toFixed(2));


      // ==========================================
      // UPDATE ALL VARIANTS
      // ==========================================

      for (const variant of product.variants) {

        const updateResponse = await fetch(

          `https://${SHOPIFY_STORE}/admin/api/2025-01/variants/${variant.id}.json`,

          {

            method: "PUT",

            headers: {

              "X-Shopify-Access-Token":
                SHOPIFY_ACCESS_TOKEN,

              "Content-Type":
                "application/json"

            },


            body: JSON.stringify({

              variant: {

                id: variant.id,

                price: finalPrice.toFixed(2)

              }

            })

          }

        );


        if (!updateResponse.ok) {

          const errorText =
            await updateResponse.text();

          console.log(

            "Variant Update Error:",

            product.title,

            errorText

          );

        }

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

      <h1>❌ Error Updating Products</h1>

      <p>${error.message}</p>

      <br>

      <a href="/">← Go Back</a>

    `);

  }

});


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
