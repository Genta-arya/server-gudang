import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";

import dotenv from "dotenv";
const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

dotenv.config();

const dbConfig = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  connectTimeout: 10000,
});



const getStockOpnameData = async () => {
  try {
    // Menggunakan pool connection yang sudah didefinisikan (dbConfig)
    const [rows] = await dbConfig.query(`
      SELECT 
        d.kode_brng, 
        d.nama_brng, 
        d.expire, 
        d.kode_kategori, 
        d.kode_sat, 
        d.dasar AS harga_dasar, 
        d.jualbebas AS harga_jual,
        g.stok,
        s.nama_suplier  
      FROM 
        databarang d
      JOIN 
        gudangbarang g ON d.kode_brng = g.kode_brng
      LEFT JOIN 
        datasuplier s ON d.kode_suplier = s.kode_suplier 
      WHERE 
        g.kd_bangsal = 'GDF' AND d.status = "1"
    `);

    return rows;
  } catch (error) {
    console.error("Error fetching stock opname data:", error);
    throw error;
  }
};

app.get("/stokopname", async (req, res) => {
  try {
    const data = await getStockOpnameData();
    const dataLength = data.length;
    console.log("Number of items:", dataLength);
    res.json({ data, length: dataLength });
  } catch (err) {
    res.status(500).json({ error: "Error fetching stock opname data" });
  }
});

app.post("/permintaan", async (req, res) => {
  const { date } = req.body;

  if (!date) {
    res.status(400).json({ error: "Date is required" });
    return;
  }

  try {
    const query = `SELECT 
    pm.no_permintaan, 
    b1.nm_bangsal AS dari, 
    b2.nm_bangsal AS untuk, 
    p1.nama,
    pm.tanggal, 
    pm.status
FROM permintaan_medis pm
Join pegawai p1 ON pm.nip = p1.nik
JOIN bangsal b1 ON pm.kd_bangsal = b1.kd_bangsal
JOIN bangsal b2 ON pm.kd_bangsaltujuan = b2.kd_bangsal
WHERE DATE(pm.tanggal) = ? AND pm.status = 'Baru'

`;

    const [results] = await dbConfig.query(query, [date]);

    res.status(200).json({
      success: true,
      data: results,
    });

    console.log("Data fetched successfully:", results);
  } catch (error) {
    console.error("Error fetching stock opname data:", error);
    res.status(500).json({ error: "Error fetching stock opname data" });
  }
});

app.post("/detail/permintaan", async (req, res) => {
  const { no_permintaan } = req.body;

  if (!no_permintaan) {
    res.status(400).json({ error: "No Permintaan is required" });
    return;
  }

  try {
    const query = `
    SELECT 
      dpm.no_permintaan, 
      dpm.kode_brng, 
      db.nama_brng, 
      dpm.keterangan, 
      dpm.kode_sat, 
      dpm.jumlah,
      p1.nama,
      pm.nip,
      pm.tanggal,
      gb.stok,
      b1.nm_bangsal AS dari, 
      b2.nm_bangsal AS untuk
    FROM detail_permintaan_medis dpm
    JOIN gudangbarang gb ON gb.kode_brng = dpm.kode_brng
    JOIN permintaan_medis pm ON pm.no_permintaan = dpm.no_permintaan 
    JOIN pegawai p1 ON p1.nik = pm.nip
    JOIN bangsal b1 ON pm.kd_bangsal = b1.kd_bangsal
    JOIN bangsal b2 ON pm.kd_bangsaltujuan = b2.kd_bangsal
    JOIN databarang db ON dpm.kode_brng = db.kode_brng
    WHERE dpm.no_permintaan = ? AND gb.kd_bangsal = 'GDF'
  `;

    // gb.stok,
    // JOIN gudangbarang gb ON gb.kode_brng = dpm.kode_brng
    const [results] = await dbConfig.query(query, [no_permintaan]);

    if (results.length === 0) {
      res
        .status(404)
        .json({ message: "No data found for the given no_permintaan" });
      return;
    }

    res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error("Error fetching detail permintaan data:", error);
    res.status(500).json({ error: "Error fetching detail permintaan data" });
  }
});
app.post("/report", async (req, res) => {
  const { date } = req.body;

  console.log(date);

  if (!date) {
    return res.status(400).json({ error: "Date is required" });
  }

  // Konversi 'YYYY-MM' menjadi 'YYYY-MM-DD' untuk startDate dan endDate
  const startDate = `${date}-01`;
  const yearMonth = date.split("-");
  if (yearMonth.length !== 2) {
    return res
      .status(400)
      .json({ error: "Invalid date format, expected YYYY-MM" });
  }

  const year = parseInt(yearMonth[0]);
  const month = parseInt(yearMonth[1]);

  if (isNaN(year) || isNaN(month)) {
    return res.status(400).json({ error: "Invalid year or month" });
  }

  const endDate = new Date(year, month, 0);
  const formattedEndDate = endDate.toISOString().split("T")[0];

  // const query = `
  //   SELECT
  //     d.nama_brng AS nama_barang,
  //     g.stok AS stok_awal,
  //     COALESCE(ek.total_keluar, 0) AS total_keluar,
  //     GREATEST(g.stok - COALESCE(ek.total_keluar, 0), 0) AS sisa_stok
  //   FROM
  //     databarang d
  //   JOIN
  //     gudangbarang g ON d.kode_brng = g.kode_brng
  //   LEFT JOIN (
  //     SELECT
  //       kode_brng,
  //       SUM(jml) AS total_keluar
  //     FROM
  //       mutasibarang
  //     WHERE
  //       kd_bangsaldari = 'GDF'
  //       AND tanggal BETWEEN ? AND ?
  //     GROUP BY
  //       kode_brng
  //   ) ek ON d.kode_brng = ek.kode_brng
  //   WHERE
  //     g.kd_bangsal = 'GDF' AND d.status = "1"
  //   GROUP BY
  //     d.nama_brng,
  //     g.stok,
  //     ek.total_keluar
  //   ORDER BY
  //     sisa_stok DESC;
  // `;

  const query = `
    SELECT 
      d.nama_brng AS nama_barang,
      g.stok AS stok_awal,
      COALESCE(ek.total_keluar, 0) AS total_keluar,
      GREATEST(g.stok - COALESCE(ek.total_keluar, 0), 0) AS sisa_stok,
      d.kode_brng,
      d.expire,
      d.kode_kategori,
      d.kode_sat,
      d.dasar AS harga_dasar,
      s.nama_suplier  
    FROM 
      databarang d
    JOIN 
      gudangbarang g ON d.kode_brng = g.kode_brng
    LEFT JOIN (
      SELECT 
        kode_brng,
        SUM(jml) AS total_keluar
      FROM 
        mutasibarang
      WHERE 
        kd_bangsaldari = 'GDF'
        AND tanggal BETWEEN ? AND ?
      GROUP BY 
        kode_brng
    ) ek ON d.kode_brng = ek.kode_brng
    LEFT JOIN 
      datasuplier s ON d.kode_suplier = s.kode_suplier 
    WHERE 
      g.kd_bangsal = 'GDF' AND d.status = "1"
    GROUP BY 
      d.nama_brng,
      g.stok,
      ek.total_keluar,
      d.kode_brng,
      d.expire,
      d.kode_kategori,
      d.kode_sat,
      d.dasar,
      s.nama_suplier
    ORDER BY 
      sisa_stok DESC;
  `;

  try {
    const [rows] = await dbConfig.query(query, [startDate, formattedEndDate]);
    res.json({ tanggal: `${month}-${year}`, data: rows, total: rows.length });
  } catch (error) {
    console.error("Error fetching stock opname data:", error);
    res.status(500).json({ error: "Error fetching stock opname data" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
