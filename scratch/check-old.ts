import axios from "axios";
import config from "../src/config";

async function checkOld() {
  const ids = [
    "CB631EBCECDFD8A25DD524D3A6418F40.uat01-vm-tx01",
    "68A7A5BC907ED76E4C983ED5EBD0C75A.uat01-vm-tx01",
    "B49DEE9D9F5E522D71FB2DC0A1378065.uat01-vm-tx01"
  ];

  for (const id of ids) {
    const url = `${config.datafast.baseUrl}/v1/checkouts/${id}/payment?entityId=${config.datafast.entityId}`;
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${config.datafast.bearerToken}` }
      });
      console.log(id, "=> Result:", res.data.result);
    } catch (err: any) {
      console.log(id, "=> Error:", err.response?.data?.result || err.message);
    }
  }
}
checkOld();
