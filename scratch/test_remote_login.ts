import axios from "axios";

async function testVariations() {
  const url = "https://api.jaganaecuador.com/api/v1/auth/login";
  const variations = [
    "Adrianrivego@hotmail.com",
    "adrianrivego@hotmail.com ",
    "adrianrivera@hotmail.com",
    "adrianrivego@gmail.com",
    "adrian",
    "Adrian Rivera",
  ];

  for (const v of variations) {
    try {
      await axios.post(url, { email: v, password: "12345678" });
      console.log(`Variation "${v}": SUCCESS`);
    } catch (err: any) {
      console.log(`Variation "${v}": FAILED ->`, err.response?.data?.message || err.message);
    }
  }
}

testVariations();
