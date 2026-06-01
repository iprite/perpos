-- B2G Orders — seed data จาก spreadsheet (21 รายการ เทศบาลเมืองบางแก้ว)
-- Imported: 2026-05-30

INSERT INTO b2g_orders (org_id,created_by,seq_no,customer_name,department,company,qt_reference,product_description,start_date,price_incl_vat,price_excl_vat,withholding_tax,net_receivable,cost_price,gross_profit,security_deposit,transfer_date,transfer_round1,transfer_round2,customer_change,customer_change_slip,petty_cash,petty_cash_slip,transport_buy,transport_sell,transport_other,operate_89,total_cost_89,net_profit_89,profit_pct,contract_date,payment_order_date,delivery_date,receipt_date,duration_days,job_status,finance_payment_date,support_payment_date,commission_payment_date,notes)
SELECT
  o.id,
  (SELECT p.id FROM profiles p JOIN organization_members om ON om.user_id = p.id WHERE om.organization_id = o.id ORDER BY p.created_at LIMIT 1),
  v.seq_no, v.customer_name, v.department, v.company, v.qt_reference,
  v.product_description, v.start_date::date,
  v.price_incl_vat, v.price_excl_vat, v.withholding_tax, v.net_receivable,
  v.cost_price, v.gross_profit, v.security_deposit,
  v.transfer_date::date, v.transfer_round1::date, v.transfer_round2::date,
  v.customer_change, v.customer_change_slip,
  v.petty_cash, v.petty_cash_slip,
  v.transport_buy, v.transport_sell, v.transport_other,
  v.operate_89, v.total_cost_89, v.net_profit_89, v.profit_pct,
  v.contract_date::date, v.payment_order_date::date,
  v.delivery_date::date, v.receipt_date::date,
  v.duration_days, v.job_status,
  v.finance_payment_date::date, v.support_payment_date::date,
  v.commission_payment_date::date, NULL
FROM organizations o,
(VALUES
  (1,'เทศบาลเมืองบางแก้ว','กองการศึกษา','89 Global Work','QT2026020001','เครื่องเคลือบบัตร และเครื่องเจาะเข้าเล่มไฟฟ้า','2026-02-23',27900.0,26074.76636,260.747664,27639.25234,18866.24,9033.76,NULL,NULL,NULL,2790.0,NULL,1395.0,NULL,NULL,500.0,NULL,2790.0,26341.24,1558.76,5.917565,'2026-04-02','2026-04-10','2026-04-28','2026-05-22',42,'รับเช็คแล้ว',NULL,NULL,NULL),
  (2,'เทศบาลเมืองบางแก้ว','กองการศึกษา','89 Global Work','QT2026020002','โต๊ะประชุม 19 ที่นั่ง','2026-02-24',77400.0,72336.4486,723.364486,76676.63551,57034.4,20365.6,NULL,NULL,NULL,7740.0,'Done',3870.0,'Done',NULL,500.0,NULL,7740.0,76884.4,515.6,0.670617,'2026-03-20','2026-03-21','2026-04-08','2026-05-07',47,'รับเช็คแล้ว','2026-05-11',NULL,NULL),
  (3,'เทศบาลเมืองบางแก้ว','กองคลัง','89 Global Work','QT2026020003','น้ำดื่มขนาด 350 มล.','2026-02-27',10500.0,9813.084112,98.130841,10401.86916,7000.0,3500.0,NULL,NULL,NULL,1050.0,'Done',525.0,'Done',NULL,500.0,NULL,1050.0,10125.0,375.0,3.703704,'2026-03-24','2026-03-25','2026-03-25','2026-04-07',13,'รับเช็คแล้ว','2026-04-08',NULL,NULL),
  (4,'เทศบาลเมืองบางแก้ว','กองการศึกษา','89 Global Work','QT2026030001','กระดานไวท์บอร์ด','2026-03-16',13000.0,12149.53271,121.495327,12878.50467,7866.5,5133.5,NULL,NULL,NULL,1300.0,'Done',650.0,'-',NULL,500.0,500.0,1300.0,12116.5,883.5,7.29171,'2026-04-09','2026-04-10','2026-04-23','2026-05-15',35,'รับเช็คแล้ว','2026-05-18',NULL,NULL),
  (5,'เทศบาลเมืองบางแก้ว','กองการเจ้าหน้าที่','P2P Supply','QT-20260300009','วัสดุสำนักงาน','2026-03-24',226745.0,211911.215,2119.11215,224625.8879,144743.47,82001.53,NULL,NULL,NULL,22674.5,NULL,11337.25,'-',NULL,500.0,NULL,22674.5,201929.72,24815.28,12.289068,'2026-05-12',NULL,NULL,NULL,NULL,'เซ็นสัญญาแล้ว รอส่งของ',NULL,NULL,NULL),
  (6,'เทศบาลเมืองบางแก้ว','กองการเจ้าหน้าที่','89 Global Work','QT2026030003','ถ่านอัลคาไลน์ขนาด AA, AAA','2026-03-24',11600.0,10841.1215,108.411215,11491.58879,4934.0,6666.0,NULL,NULL,NULL,1160.0,NULL,580.0,NULL,NULL,500.0,NULL,1160.0,8334.0,3266.0,39.188865,'2026-05-07','2026-05-07','2026-05-12',NULL,NULL,'ส่งสินค้าแล้ว รอรับเช็ค',NULL,NULL,NULL),
  (7,'เทศบาลเมืองบางแก้ว','กองศึกษา','89 Global Work','QT2026030004','โต๊ะพับอเนกประสงค์ ขนาด 150x60x74 ซม.','2026-03-25',117600.0,109906.5421,1099.065421,116500.9346,28800.0,88800.0,5880.0,NULL,NULL,11760.0,NULL,5880.0,NULL,NULL,500.0,NULL,11760.0,64580.0,53020.0,82.099721,'2026-04-30','2026-05-05','2026-05-15',NULL,NULL,'ส่งสินค้าแล้ว รอรับเช็ค',NULL,NULL,NULL),
  (8,'เทศบาลเมืองบางแก้ว','กองการเจ้าหน้าที่','P2P Supply','QT-20260300007','น้ำหอมปรับอากาศ','2026-03-25',10920.0,10205.60748,102.056075,10817.94393,6904.0,4016.0,NULL,NULL,NULL,1092.0,NULL,546.0,'-',NULL,500.0,NULL,1092.0,10134.0,786.0,7.756069,'2026-05-12',NULL,NULL,NULL,NULL,'เซ็นสัญญาแล้ว รอส่งของ',NULL,NULL,NULL),
  (9,'เทศบาลเมืองบางแก้ว','กองศึกษา','89 Global Work','QT2026030006','โทรทัศน์แอลอีดี (LED TV) แบบ Smart TV ขนาด 50 นิ้ว','2026-03-25',18300.0,17102.80374,171.028037,18128.97196,11440.0,6860.0,NULL,NULL,NULL,1830.0,NULL,915.0,NULL,NULL,400.0,NULL,1830.0,16415.0,1885.0,11.483399,'2026-04-02','2026-04-19','2026-05-06',NULL,NULL,'ส่งสินค้าแล้ว รอรับเช็ค',NULL,NULL,NULL),
  (10,'เทศบาลเมืองบางแก้ว','กองยุทธศาสตร์ฯ','P2P Supply','QT-20260300017','ตู้เย็น 2 ประตู','2026-03-26',70500.0,65887.85047,658.878505,69841.1215,52470.0,18030.0,NULL,NULL,NULL,7050.0,NULL,3525.0,'-',NULL,300.0,NULL,7050.0,70395.0,105.0,0.149158,'2026-04-02','2026-04-07','2026-04-10','2026-05-12',35,'รับเช็คแล้ว','2026-05-14',NULL,NULL),
  (11,'เทศบาลเมืองบางแก้ว','สำนักปลัด','89 Global Work','QT2026030009','เครื่องฟอกอากาศ เครื่องทำลายเอกสาร','2026-03-26',161500.0,150934.5794,1509.345794,159990.6542,121050.0,40450.0,8075.0,NULL,NULL,16150.0,'Done',8075.0,'Done',NULL,500.0,NULL,16150.0,170000.0,0.0,0.0,'2026-04-02','2026-04-09','2026-04-09','2026-05-12',33,'รับเช็คแล้ว','2026-05-14',NULL,NULL),
  (12,'เทศบาลเมืองบางแก้ว','กองสาธารณสุข','89 Global Work','QT2026030010','ตู้เหล็ก 2 บาน','2026-03-26',26400.0,24672.8972,246.728972,26153.27103,23540.0,2860.0,NULL,NULL,NULL,2640.0,'Done',1320.0,'Done',NULL,300.0,NULL,2640.0,30440.0,0.0,0.0,'2026-04-02','2026-04-10','2026-04-22','2026-05-12',32,'รับเช็คแล้ว','2026-05-14',NULL,NULL),
  (13,'เทศบาลเมืองบางแก้ว','กองสาธารณสุข','89 Global Work','QT2026030011','โทรศัพท์เคลื่อนที่','2026-03-26',44000.0,41121.49533,411.214953,43588.78505,35069.0,8931.0,NULL,NULL,NULL,4400.0,NULL,2200.0,NULL,NULL,300.0,NULL,4400.0,46369.0,0.0,0.0,'2026-05-12','2026-05-15','2026-05-19',NULL,NULL,'ส่งสินค้าแล้ว รอรับเช็ค',NULL,NULL,NULL),
  (14,'เทศบาลเมืองบางแก้ว','กองสาธารณสุข','P2P Supply','QT-20260300015','เครื่องรับ-ส่งวิทยุ ระบบ VHF/FM ชนิดมือถือ 5 วัตต์','2026-03-26',24000.0,22429.90654,224.299065,23775.70093,11770.0,12230.0,NULL,NULL,NULL,2400.0,NULL,1200.0,'-',NULL,300.0,NULL,2400.0,18070.0,5930.0,32.816823,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (15,'เทศบาลเมืองบางแก้ว','กองสาธารณสุข','P2P Supply','QT-20260300016','แม่แรงตะเข้ ขนาด 5 ตัน','2026-03-28',23500.0,21962.61682,219.626168,23280.37383,15515.0,7985.0,NULL,NULL,NULL,2350.0,NULL,1175.0,'-',NULL,300.0,NULL,2350.0,21690.0,1810.0,8.344859,'2026-04-28','2026-04-30','2026-05-08',NULL,NULL,'ส่งสินค้าแล้ว รอรับเช็ค',NULL,NULL,NULL),
  (16,'เทศบาลเมืองบางแก้ว','กองสาธารณสุข','89 Global Work','QT2026040003','ครุภัณฑ์สำนักงาน 15 รายการ','2026-04-22',581400.0,543364.486,5433.64486,575966.3551,479521.8,101878.2,NULL,NULL,NULL,58140.0,NULL,29070.0,NULL,NULL,NULL,NULL,58140.0,624871.8,0.0,0.0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (17,'เทศบาลเมืองบางแก้ว','กองศึกษาฯ','P2P Supply','QT-20260400001','เครื่องตัดหหญ้า 4 จังหวะ','2026-04-08',19000.0,17757.00935,177.570094,18822.42991,15295.0,3705.0,NULL,NULL,NULL,1900.0,NULL,950.0,'-',NULL,NULL,NULL,1900.0,20045.0,0.0,0.0,'2026-05-12','2026-04-08','2026-05-14',NULL,NULL,'ส่งสินค้าแล้ว รอรับเช็ค',NULL,NULL,NULL),
  (18,'เทศบาลเมืองบางแก้ว','สำนักปลัด ฝ่ายบริหาร','P2P Supply','QT-20260500002','งานคอม งานที่ 1','2026-05-06',329000.0,307476.6355,3074.766355,325925.2336,264932.0,64068.0,NULL,NULL,NULL,32900.0,NULL,16450.0,'-',NULL,NULL,NULL,32900.0,347182.0,-18182.0,-5.237023,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (19,'เทศบาลเมืองบางแก้ว','สำนักปลัด ฝ่ายรักษาความสงบ','P2P Supply','QT-20260500003','งานคอม งานที่ 2','2026-05-06',139000.0,129906.5421,1299.065421,137700.9346,111815.0,27185.0,NULL,NULL,NULL,13900.0,NULL,6950.0,'-',NULL,NULL,NULL,13900.0,146565.0,-7565.0,-5.161532,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (20,'เทศบาลเมืองบางแก้ว','สำนักปลัด','89 Global Work','QT2026040004','โต๊ะพับอเนกประสงค์ โต๊ะหน้าขาว ขาสแตนเลส','2026-04-30',325000.0,303738.3178,3037.383178,321962.6168,120250.0,204750.0,NULL,NULL,NULL,32500.0,NULL,16250.0,NULL,NULL,NULL,NULL,32500.0,201500.0,123500.0,61.290323,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (21,'เทศบาลเมืองบางแก้ว','สำนักปลัด','89 Global Work','QT2026050004','ตู้เก็บของ ห้องนายก รอง และปลัด',NULL,451000.0,421495.3271,4214.953271,446785.0467,204370.0,246630.0,NULL,NULL,NULL,45100.0,NULL,22550.0,NULL,NULL,NULL,NULL,45100.0,317120.0,133880.0,42.217457,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)
) AS v(seq_no,customer_name,department,company,qt_reference,product_description,start_date,
       price_incl_vat,price_excl_vat,withholding_tax,net_receivable,cost_price,gross_profit,
       security_deposit,transfer_date,transfer_round1,
       customer_change,customer_change_slip,petty_cash,petty_cash_slip,
       transport_buy,transport_sell,transport_other,operate_89,
       total_cost_89,net_profit_89,profit_pct,
       contract_date,payment_order_date,delivery_date,receipt_date,duration_days,
       job_status,finance_payment_date,support_payment_date,commission_payment_date)
WHERE o.slug = 'p2p-x-89'
ON CONFLICT DO NOTHING;
