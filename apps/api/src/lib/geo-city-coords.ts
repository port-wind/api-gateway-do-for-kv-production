/**
 * 城市坐标数据 (Tier 1)
 * 
 * 数据来源: GeoNames (https://www.geonames.org/)
 * 许可证: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
 * 生成时间: 2025-10-20T09:41:14.258Z
 * 城市数量: 990
 * 筛选规则: 人口 >= 500k OR 国家/省会首府
 * 去重规则: 相同名称保留人口最多的城市
 */

export const CITY_COORDS: Record<string, {
  coords: [number, number];  // [lng, lat]
  country: string;
  population: number;
  geonameId: number;
}> = {
  "Shanghai": {
    coords: [121.45806, 31.22222],
    country: "CN",
    population: 24874500,
    geonameId: 1796236
  },
  "Beijing": {
    coords: [116.39723, 39.9075],
    country: "CN",
    population: 18960744,
    geonameId: 1816670
  },
  "Shenzhen": {
    coords: [114.0683, 22.54554],
    country: "CN",
    population: 17494398,
    geonameId: 1795565
  },
  "Guangzhou": {
    coords: [113.25, 23.11667],
    country: "CN",
    population: 16096724,
    geonameId: 1809858
  },
  "Kinshasa": {
    coords: [15.31357, -4.32758],
    country: "CD",
    population: 16000000,
    geonameId: 2314302
  },
  "Istanbul": {
    coords: [28.94966, 41.01384],
    country: "TR",
    population: 15701602,
    geonameId: 745044
  },
  "Lagos": {
    coords: [3.39467, 6.45407],
    country: "NG",
    population: 15388000,
    geonameId: 2332459
  },
  "Ho Chi Minh City": {
    coords: [106.62965, 10.82302],
    country: "VN",
    population: 14002598,
    geonameId: 1566083
  },
  "Chengdu": {
    coords: [104.06667, 30.66667],
    country: "CN",
    population: 13568357,
    geonameId: 1815286
  },
  "Lahore": {
    coords: [74.35071, 31.558],
    country: "PK",
    population: 13004135,
    geonameId: 1172451
  },
  "Mumbai": {
    coords: [72.88261, 19.07283],
    country: "IN",
    population: 12691836,
    geonameId: 1275339
  },
  "Sao Paulo": {
    coords: [-46.63611, -23.5475],
    country: "BR",
    population: 12400232,
    geonameId: 3448439
  },
  "Mexico City": {
    coords: [-99.12766, 19.42847],
    country: "MX",
    population: 12294193,
    geonameId: 3530597
  },
  "Karachi": {
    coords: [67.0104, 24.8608],
    country: "PK",
    population: 11624219,
    geonameId: 1174872
  },
  "Tianjin": {
    coords: [117.17667, 39.14222],
    country: "CN",
    population: 11090314,
    geonameId: 1792947
  },
  "Delhi": {
    coords: [77.23149, 28.65195],
    country: "IN",
    population: 11034555,
    geonameId: 1273294
  },
  "Wuhan": {
    coords: [114.26667, 30.58333],
    country: "CN",
    population: 10392693,
    geonameId: 1791247
  },
  "Moscow": {
    coords: [37.61781, 55.75204],
    country: "RU",
    population: 10381222,
    geonameId: 524901
  },
  "Dhaka": {
    coords: [90.40744, 23.7104],
    country: "BD",
    population: 10356500,
    geonameId: 1185241
  },
  "Seoul": {
    coords: [126.9784, 37.566],
    country: "KR",
    population: 10349312,
    geonameId: 1835848
  },
  "Tokyo": {
    coords: [139.69171, 35.6895],
    country: "JP",
    population: 9733276,
    geonameId: 1850147
  },
  "Dongguan": {
    coords: [113.74866, 23.01797],
    country: "CN",
    population: 9644871,
    geonameId: 1812545
  },
  "Cairo": {
    coords: [31.24967, 30.06263],
    country: "EG",
    population: 9606916,
    geonameId: 360630
  },
  "Xi'an": {
    coords: [108.92861, 34.25833],
    country: "CN",
    population: 9600000,
    geonameId: 1790630
  },
  "Johannesburg": {
    coords: [28.04363, -26.20227],
    country: "ZA",
    population: 9418183,
    geonameId: 993800
  },
  "Nanjing": {
    coords: [118.77778, 32.06167],
    country: "CN",
    population: 9314685,
    geonameId: 1799962
  },
  "Hangzhou": {
    coords: [120.16142, 30.29365],
    country: "CN",
    population: 9236032,
    geonameId: 1808926
  },
  "Foshan": {
    coords: [113.13148, 23.02677],
    country: "CN",
    population: 9042509,
    geonameId: 1811103
  },
  "London": {
    coords: [-0.12574, 51.50853],
    country: "GB",
    population: 8961989,
    geonameId: 2643743
  },
  "New York City": {
    coords: [-74.00597, 40.71427],
    country: "US",
    population: 8804190,
    geonameId: 5128581
  },
  "Jakarta": {
    coords: [106.84513, -6.21462],
    country: "ID",
    population: 8540121,
    geonameId: 1642911
  },
  "Bengaluru": {
    coords: [77.59369, 12.97194],
    country: "IN",
    population: 8495492,
    geonameId: 1277333
  },
  "Hanoi": {
    coords: [105.84117, 21.0245],
    country: "VN",
    population: 8053663,
    geonameId: 1581130
  },
  "Taipei": {
    coords: [121.52639, 25.05306],
    country: "TW",
    population: 7871900,
    geonameId: 1668341
  },
  "Lima": {
    coords: [-77.02824, -12.04318],
    country: "PE",
    population: 7737002,
    geonameId: 3936456
  },
  "Bogota": {
    coords: [-74.08175, 4.60971],
    country: "CO",
    population: 7674366,
    geonameId: 3688689
  },
  "Chongqing": {
    coords: [106.55771, 29.56026],
    country: "CN",
    population: 7457599,
    geonameId: 1814906
  },
  "Hong Kong": {
    coords: [114.17469, 22.27832],
    country: "HK",
    population: 7396076,
    geonameId: 1819729
  },
  "Baghdad": {
    coords: [44.40088, 33.34058],
    country: "IQ",
    population: 7216000,
    geonameId: 98182
  },
  "Qingdao": {
    coords: [120.38042, 36.06488],
    country: "CN",
    population: 7172451,
    geonameId: 1797929
  },
  "Tehran": {
    coords: [51.42151, 35.69439],
    country: "IR",
    population: 7153309,
    geonameId: 112931
  },
  "Shenyang": {
    coords: [123.43278, 41.79222],
    country: "CN",
    population: 7050000,
    geonameId: 2034937
  },
  "Hyderabad": {
    coords: [78.45636, 17.38405],
    country: "IN",
    population: 6993262,
    geonameId: 1269843
  },
  "Rio De Janeiro": {
    coords: [-43.18223, -22.90642],
    country: "BR",
    population: 6747815,
    geonameId: 3451190
  },
  "Suzhou": {
    coords: [120.59538, 31.30408],
    country: "CN",
    population: 6715559,
    geonameId: 1886760
  },
  "Ahmedabad": {
    coords: [72.58727, 23.02579],
    country: "IN",
    population: 6357693,
    geonameId: 1279233
  },
  "Abidjan": {
    coords: [-4.00167, 5.35444],
    country: "CI",
    population: 6321017,
    geonameId: 2293538
  },
  "Singapore": {
    coords: [103.85007, 1.28967],
    country: "SG",
    population: 5638700,
    geonameId: 1880252
  },
  "Sydney": {
    coords: [151.20732, -33.86785],
    country: "AU",
    population: 5557233,
    geonameId: 2147714
  },
  "Dar Es Salaam": {
    coords: [39.26951, -6.82349],
    country: "TZ",
    population: 5383728,
    geonameId: 160263
  },
  "Saint Petersburg": {
    coords: [30.31413, 59.93863],
    country: "RU",
    population: 5351935,
    geonameId: 498817
  },
  "Melbourne": {
    coords: [144.96332, -37.814],
    country: "AU",
    population: 5350705,
    geonameId: 2158177
  },
  "Alexandria": {
    coords: [29.91582, 31.20176],
    country: "EG",
    population: 5263542,
    geonameId: 361058
  },
  "Harbin": {
    coords: [126.65, 45.75],
    country: "CN",
    population: 5242897,
    geonameId: 2037013
  },
  "Bangkok": {
    coords: [100.50144, 13.75398],
    country: "TH",
    population: 5104476,
    geonameId: 1609350
  },
  "Hefei": {
    coords: [117.28083, 31.86389],
    country: "CN",
    population: 5050000,
    geonameId: 1808722
  },
  "Dalian": {
    coords: [121.60222, 38.91222],
    country: "CN",
    population: 4913879,
    geonameId: 1814087
  },
  "Kano": {
    coords: [8.51672, 12.00012],
    country: "NG",
    population: 4910000,
    geonameId: 2335204
  },
  "Santiago": {
    coords: [-70.64827, -33.45694],
    country: "CL",
    population: 4837295,
    geonameId: 3871336
  },
  "Cape Town": {
    coords: [18.42322, -33.92584],
    country: "ZA",
    population: 4772846,
    geonameId: 3369157
  },
  "Peshawar": {
    coords: [71.57849, 34.008],
    country: "PK",
    population: 4758762,
    geonameId: 1168197
  },
  "Changchun": {
    coords: [125.32278, 43.88],
    country: "CN",
    population: 4714996,
    geonameId: 2038180
  },
  "Jeddah": {
    coords: [39.18624, 21.49012],
    country: "SA",
    population: 4697000,
    geonameId: 105343
  },
  "Chennai": {
    coords: [80.27847, 13.08784],
    country: "IN",
    population: 4681087,
    geonameId: 1264527
  },
  "Kolkata": {
    coords: [88.36304, 22.56263],
    country: "IN",
    population: 4631392,
    geonameId: 1275004
  },
  "Xiamen": {
    coords: [118.08187, 24.47979],
    country: "CN",
    population: 4617251,
    geonameId: 1790645
  },
  "Surat": {
    coords: [72.83023, 21.19594],
    country: "IN",
    population: 4591246,
    geonameId: 1255364
  },
  "Yangon": {
    coords: [96.15611, 16.80528],
    country: "MM",
    population: 4477638,
    geonameId: 1298824
  },
  "Bao'an": {
    coords: [113.88288, 22.55213],
    country: "CN",
    population: 4476554,
    geonameId: 13308620
  },
  "Kabul": {
    coords: [69.17233, 34.52813],
    country: "AF",
    population: 4434550,
    geonameId: 1138958
  },
  "Nairobi": {
    coords: [36.81667, -1.28333],
    country: "KE",
    population: 4397073,
    geonameId: 184745
  },
  "Wuxi": {
    coords: [120.28857, 31.56887],
    country: "CN",
    population: 4396835,
    geonameId: 1790923
  },
  "Giza": {
    coords: [31.20861, 30.00944],
    country: "EG",
    population: 4367343,
    geonameId: 360995
  },
  "Jinan": {
    coords: [116.99722, 36.66833],
    country: "CN",
    population: 4335989,
    geonameId: 1805753
  },
  "Taiyuan": {
    coords: [112.56028, 37.86944],
    country: "CN",
    population: 4303673,
    geonameId: 1793511
  },
  "Zhengzhou": {
    coords: [113.64861, 34.75778],
    country: "CN",
    population: 4253913,
    geonameId: 1784658
  },
  "Bamako": {
    coords: [-7.97522, 12.60915],
    country: "ML",
    population: 4227569,
    geonameId: 2460596
  },
  "Riyadh": {
    coords: [46.72185, 24.68773],
    country: "SA",
    population: 4205961,
    geonameId: 108410
  },
  "New Taipei City": {
    coords: [121.45703, 25.06199],
    country: "TW",
    population: 4004367,
    geonameId: 12908892
  },
  "New Territories": {
    coords: [114.11095, 22.42441],
    country: "HK",
    population: 3984077,
    geonameId: 12747063
  },
  "Shijiazhuang": {
    coords: [114.47861, 38.04139],
    country: "CN",
    population: 3938513,
    geonameId: 1795270
  },
  "Chattogram": {
    coords: [91.83168, 22.3384],
    country: "BD",
    population: 3920222,
    geonameId: 1205733
  },
  "Addis Ababa": {
    coords: [38.74689, 9.02497],
    country: "ET",
    population: 3860000,
    geonameId: 344979
  },
  "Kunming": {
    coords: [102.71833, 25.03889],
    country: "CN",
    population: 3855346,
    geonameId: 1804651
  },
  "Zhongshan": {
    coords: [113.37912, 22.52306],
    country: "CN",
    population: 3841873,
    geonameId: 6986104
  },
  "Nanning": {
    coords: [108.31667, 22.81667],
    country: "CN",
    population: 3839800,
    geonameId: 1799869
  },
  "Shantou": {
    coords: [116.67876, 23.35489],
    country: "CN",
    population: 3838900,
    geonameId: 1795940
  },
  "Los Angeles": {
    coords: [-118.24368, 34.05223],
    country: "US",
    population: 3820914,
    geonameId: 5368361
  },
  "Faisalabad": {
    coords: [73.08969, 31.41554],
    country: "PK",
    population: 3800193,
    geonameId: 1179400
  },
  "Dubai": {
    coords: [55.30927, 25.07725],
    country: "AE",
    population: 3790000,
    geonameId: 292223
  },
  "Yokohama": {
    coords: [139.65, 35.43333],
    country: "JP",
    population: 3777491,
    geonameId: 1848354
  },
  "Fuzhou": {
    coords: [119.30611, 26.06139],
    country: "CN",
    population: 3740000,
    geonameId: 1810821
  },
  "Ningbo": {
    coords: [121.54945, 29.87819],
    country: "CN",
    population: 3731203,
    geonameId: 1799397
  },
  "Casablanca": {
    coords: [-7.61138, 33.58831],
    country: "MA",
    population: 3665954,
    geonameId: 2553604
  },
  "Ibadan": {
    coords: [3.90591, 7.37756],
    country: "NG",
    population: 3649000,
    geonameId: 2339354
  },
  "Puyang": {
    coords: [119.88872, 29.45679],
    country: "CN",
    population: 3590000,
    geonameId: 1798425
  },
  "Ankara": {
    coords: [32.85427, 39.91987],
    country: "TR",
    population: 3517182,
    geonameId: 323786
  },
  "Shiyan": {
    coords: [110.77806, 32.6475],
    country: "CN",
    population: 3460000,
    geonameId: 1794903
  },
  "Berlin": {
    coords: [13.41053, 52.52437],
    country: "DE",
    population: 3426354,
    geonameId: 2950159
  },
  "Tangshan": {
    coords: [118.18319, 39.64381],
    country: "CN",
    population: 3372102,
    geonameId: 1793346
  },
  "Rawalpindi": {
    coords: [73.0479, 33.59733],
    country: "PK",
    population: 3357612,
    geonameId: 1166993
  },
  "Lueliang": {
    coords: [111.14436, 37.5192],
    country: "CN",
    population: 3346500,
    geonameId: 13512505
  },
  "Busan": {
    coords: [129.03004, 35.10168],
    country: "KR",
    population: 3343903,
    geonameId: 1838524
  },
  "Durban": {
    coords: [31.0292, -29.8579],
    country: "ZA",
    population: 3338026,
    geonameId: 1007311
  },
  "Changzhou": {
    coords: [119.95401, 31.77359],
    country: "CN",
    population: 3290918,
    geonameId: 1815456
  },
  "Madrid": {
    coords: [-3.70256, 40.4165],
    country: "ES",
    population: 3255944,
    geonameId: 3117735
  },
  "Pyongyang": {
    coords: [125.75432, 39.03385],
    country: "KP",
    population: 3222000,
    geonameId: 1871859
  },
  "Zibo": {
    coords: [118.06333, 36.79056],
    country: "CN",
    population: 3129228,
    geonameId: 1785286
  },
  "Pune": {
    coords: [73.85535, 18.51957],
    country: "IN",
    population: 3124458,
    geonameId: 1259229
  },
  "Bursa": {
    coords: [29.06013, 40.19559],
    country: "TR",
    population: 3101833,
    geonameId: 750269
  },
  "Changsha": {
    coords: [112.97087, 28.19874],
    country: "CN",
    population: 3093980,
    geonameId: 1815577
  },
  "Quezon City": {
    coords: [121.0509, 14.6488],
    country: "PH",
    population: 3084270,
    geonameId: 1692192
  },
  "Jaipur": {
    coords: [75.78781, 26.91962],
    country: "IN",
    population: 3046163,
    geonameId: 1269515
  },
  "Incheon": {
    coords: [126.70515, 37.45646],
    country: "KR",
    population: 3039450,
    geonameId: 1843564
  },
  "Guiyang": {
    coords: [106.71667, 26.58333],
    country: "CN",
    population: 3037159,
    geonameId: 1809461
  },
  "Ueruemqi": {
    coords: [87.60046, 43.80096],
    country: "CN",
    population: 3029372,
    geonameId: 1529102
  },
  "Lanzhou": {
    coords: [103.83987, 36.05701],
    country: "CN",
    population: 3000000,
    geonameId: 1804430
  },
  "Caracas": {
    coords: [-66.87919, 10.48801],
    country: "VE",
    population: 3000000,
    geonameId: 3646738
  },
  "Izmir": {
    coords: [27.13838, 38.41273],
    country: "TR",
    population: 2938292,
    geonameId: 311046
  },
  "Huizhou": {
    coords: [114.41523, 23.11147],
    country: "CN",
    population: 2900113,
    geonameId: 1806776
  },
  "Buenos Aires": {
    coords: [-58.37723, -34.61315],
    country: "AR",
    population: 2891082,
    geonameId: 3435910
  },
  "Surabaya": {
    coords: [112.75083, -7.24917],
    country: "ID",
    population: 2874314,
    geonameId: 1625822
  },
  "Haikou": {
    coords: [110.34651, 20.03421],
    country: "CN",
    population: 2873358,
    geonameId: 1809078
  },
  "Taichung": {
    coords: [120.6839, 24.1469],
    country: "TW",
    population: 2850285,
    geonameId: 1668399
  },
  "Kanpur": {
    coords: [80.34975, 26.46523],
    country: "IN",
    population: 2823249,
    geonameId: 1267995
  },
  "Kyiv": {
    coords: [30.5238, 50.45466],
    country: "UA",
    population: 2797553,
    geonameId: 703448
  },
  "Toronto": {
    coords: [-79.39864, 43.70643],
    country: "CA",
    population: 2794356,
    geonameId: 6167865
  },
  "Quito": {
    coords: [-78.52495, -0.22985],
    country: "EC",
    population: 2781641,
    geonameId: 3652462
  },
  "Brisbane": {
    coords: [153.02809, -27.46794],
    country: "AU",
    population: 2780063,
    geonameId: 2174003
  },
  "Luanda": {
    coords: [13.23432, -8.83682],
    country: "AO",
    population: 2776168,
    geonameId: 2240449
  },
  "Osaka": {
    coords: [135.50107, 34.69379],
    country: "JP",
    population: 2753862,
    geonameId: 1853909
  },
  "Linyi": {
    coords: [118.34278, 35.06306],
    country: "CN",
    population: 2743843,
    geonameId: 1803318
  },
  "Baoding": {
    coords: [115.46246, 38.87288],
    country: "CN",
    population: 2739887,
    geonameId: 1816971
  },
  "Kaohsiung": {
    coords: [120.31333, 22.61626],
    country: "TW",
    population: 2737660,
    geonameId: 1673820
  },
  "Brooklyn": {
    coords: [-73.94958, 40.6501],
    country: "US",
    population: 2736074,
    geonameId: 5110302
  },
  "Guayaquil": {
    coords: [-79.88621, -2.19616],
    country: "EC",
    population: 2723665,
    geonameId: 3657509
  },
  "Belo Horizonte": {
    coords: [-43.93778, -19.92083],
    country: "BR",
    population: 2721564,
    geonameId: 3470127
  },
  "Salvador": {
    coords: [-38.49096, -12.97563],
    country: "BR",
    population: 2711840,
    geonameId: 3450554
  },
  "Abuja": {
    coords: [7.49508, 9.05785],
    country: "NG",
    population: 2690000,
    geonameId: 2352778
  },
  "Gazipur": {
    coords: [90.42234, 23.99844],
    country: "BD",
    population: 2674697,
    geonameId: 1200109
  },
  "Chicago": {
    coords: [-87.65005, 41.85003],
    country: "US",
    population: 2664452,
    geonameId: 4887398
  },
  "Wenzhou": {
    coords: [120.66682, 27.99942],
    country: "CN",
    population: 2650000,
    geonameId: 1791388
  },
  "Dakar": {
    coords: [-17.44406, 14.6937],
    country: "SN",
    population: 2646503,
    geonameId: 2253354
  },
  "Haiphong": {
    coords: [106.68345, 20.86481],
    country: "VN",
    population: 2625200,
    geonameId: 1581298
  },
  "Yunfu": {
    coords: [112.03809, 22.92787],
    country: "CN",
    population: 2612800,
    geonameId: 1785725
  },
  "Navi Mumbai": {
    coords: [73.01582, 19.03681],
    country: "IN",
    population: 2600000,
    geonameId: 6619347
  },
  "Mogadishu": {
    coords: [45.34375, 2.03711],
    country: "SO",
    population: 2587183,
    geonameId: 53654
  },
  "Bekasi": {
    coords: [106.9896, -6.2349],
    country: "ID",
    population: 2564940,
    geonameId: 1649378
  },
  "Kumasi": {
    coords: [-1.62443, 6.68848],
    country: "GH",
    population: 2544530,
    geonameId: 2298890
  },
  "Gujranwala": {
    coords: [74.18705, 32.15567],
    country: "PK",
    population: 2511118,
    geonameId: 1177662
  },
  "Huai'an": {
    coords: [119.01917, 33.58861],
    country: "CN",
    population: 2494013,
    geonameId: 1797873
  },
  "Lucknow": {
    coords: [80.92313, 26.83928],
    country: "IN",
    population: 2472011,
    geonameId: 1264733
  },
  "Bandung": {
    coords: [107.60694, -6.92222],
    country: "ID",
    population: 2444160,
    geonameId: 1650357
  },
  "Medan": {
    coords: [98.66667, 3.58333],
    country: "ID",
    population: 2435252,
    geonameId: 1214520
  },
  "Ouagadougou": {
    coords: [-1.53388, 12.36566],
    country: "BF",
    population: 2415266,
    geonameId: 2357048
  },
  "Nagpur": {
    coords: [79.08491, 21.14631],
    country: "IN",
    population: 2405665,
    geonameId: 1262180
  },
  "Fortaleza": {
    coords: [-38.54306, -3.71722],
    country: "BR",
    population: 2400000,
    geonameId: 3399415
  },
  "Cali": {
    coords: [-76.5199, 3.43054],
    country: "CO",
    population: 2392877,
    geonameId: 3687925
  },
  "Daegu": {
    coords: [128.59111, 35.87028],
    country: "KR",
    population: 2365523,
    geonameId: 1835329
  },
  "Algiers": {
    coords: [3.08746, 36.73225],
    country: "DZ",
    population: 2364230,
    geonameId: 2507480
  },
  "Nanchang": {
    coords: [115.85306, 28.68396],
    country: "CN",
    population: 2357839,
    geonameId: 1800163
  },
  "Hohhot": {
    coords: [111.65222, 40.81056],
    country: "CN",
    population: 2350000,
    geonameId: 2036892
  },
  "Nagoya": {
    coords: [136.90641, 35.18147],
    country: "JP",
    population: 2332176,
    geonameId: 1856057
  },
  "Rome": {
    coords: [12.51133, 41.89193],
    country: "IT",
    population: 2318895,
    geonameId: 3169070
  },
  "Queens": {
    coords: [-73.83652, 40.68149],
    country: "US",
    population: 2316841,
    geonameId: 5133273
  },
  "Houston": {
    coords: [-95.36327, 29.76328],
    country: "US",
    population: 2314157,
    geonameId: 4699066
  },
  "Perth": {
    coords: [115.8614, -31.95224],
    country: "AU",
    population: 2309338,
    geonameId: 2063523
  },
  "Mashhad": {
    coords: [59.60567, 36.29807],
    country: "IR",
    population: 2307177,
    geonameId: 124665
  },
  "Shaoxing": {
    coords: [120.57864, 30.00237],
    country: "CN",
    population: 2300000,
    geonameId: 1795855
  },
  "Nantong": {
    coords: [120.87472, 32.03028],
    country: "CN",
    population: 2273326,
    geonameId: 1799722
  },
  "Kowloon": {
    coords: [114.18333, 22.31667],
    country: "HK",
    population: 2232339,
    geonameId: 1819609
  },
  "Yantai": {
    coords: [121.44081, 37.47649],
    country: "CN",
    population: 2227733,
    geonameId: 1787093
  },
  "Lubumbashi": {
    coords: [27.47938, -11.66089],
    country: "CD",
    population: 2221925,
    geonameId: 922704
  },
  "Manaus": {
    coords: [-60.025, -3.10194],
    country: "BR",
    population: 2219580,
    geonameId: 3663517
  },
  "Lusaka": {
    coords: [28.28713, -15.40669],
    country: "ZM",
    population: 2212301,
    geonameId: 909137
  },
  "Brasilia": {
    coords: [-47.92972, -15.77972],
    country: "BR",
    population: 2207718,
    geonameId: 3469058
  },
  "Zhuhai": {
    coords: [113.56778, 22.27694],
    country: "CN",
    population: 2207090,
    geonameId: 1790437
  },
  "Santo Domingo": {
    coords: [-69.89232, 18.47186],
    country: "DO",
    population: 2201941,
    geonameId: 3492908
  },
  "Lome": {
    coords: [1.22154, 6.12874],
    country: "TG",
    population: 2188376,
    geonameId: 2365267
  },
  "Multan": {
    coords: [71.47824, 30.19679],
    country: "PK",
    population: 2169915,
    geonameId: 1169825
  },
  "Havana": {
    coords: [-82.38304, 23.13302],
    country: "CU",
    population: 2163824,
    geonameId: 3553478
  },
  "Baotou": {
    coords: [109.84389, 40.6516],
    country: "CN",
    population: 2150000,
    geonameId: 2038432
  },
  "Depok": {
    coords: [106.81861, -6.4],
    country: "ID",
    population: 2145400,
    geonameId: 1645524
  },
  "Paris": {
    coords: [2.3488, 48.85341],
    country: "FR",
    population: 2138551,
    geonameId: 2988507
  },
  "Coimbatore": {
    coords: [76.96612, 11.00555],
    country: "IN",
    population: 2136916,
    geonameId: 1273865
  },
  "Gaziantep": {
    coords: [37.3825, 37.05944],
    country: "TR",
    population: 2130432,
    geonameId: 314830
  },
  "Qingyang": {
    coords: [107.64455, 35.70976],
    country: "CN",
    population: 2125400,
    geonameId: 12359313
  },
  "Port Harcourt": {
    coords: [7.0134, 4.77742],
    country: "NG",
    population: 2120000,
    geonameId: 2324774
  },
  "Pretoria": {
    coords: [28.18783, -25.74486],
    country: "ZA",
    population: 2112693,
    geonameId: 964137
  },
  "Cordoba": {
    coords: [-64.18853, -31.40648],
    country: "AR",
    population: 2106734,
    geonameId: 3860259
  },
  "Mbuji-mayi": {
    coords: [23.58979, -6.13603],
    country: "CD",
    population: 2101332,
    geonameId: 209228
  },
  "Aleppo": {
    coords: [37.16117, 36.20124],
    country: "SY",
    population: 2098210,
    geonameId: 170063
  },
  "Kunshan": {
    coords: [120.95431, 31.37762],
    country: "CN",
    population: 2092496,
    geonameId: 1785623
  },
  "Al Mawsil Al Jadidah": {
    coords: [43.10555, 36.33271],
    country: "IQ",
    population: 2065597,
    geonameId: 99071
  },
  "Weifang": {
    coords: [119.10194, 36.71],
    country: "CN",
    population: 2044028,
    geonameId: 1791681
  },
  "Zunyi": {
    coords: [106.90722, 27.68667],
    country: "CN",
    population: 2037775,
    geonameId: 1783621
  },
  "Al Basrah Al Qadimah": {
    coords: [47.81507, 30.50316],
    country: "IQ",
    population: 2015483,
    geonameId: 388349
  },
  "La Paz": {
    coords: [-68.15, -16.5],
    country: "BO",
    population: 2004652,
    geonameId: 3911925
  },
  "Lianyungang": {
    coords: [119.21556, 34.59845],
    country: "CN",
    population: 2001009,
    geonameId: 10859300
  },
  "Medellin": {
    coords: [-75.57151, 6.245],
    country: "CO",
    population: 1999979,
    geonameId: 3674962
  },
  "Indore": {
    coords: [75.8333, 22.71792],
    country: "IN",
    population: 1994397,
    geonameId: 1269743
  },
  "Brazzaville": {
    coords: [15.28318, -4.26613],
    country: "CG",
    population: 1982000,
    geonameId: 2260535
  },
  "Tashkent": {
    coords: [69.21627, 41.26465],
    country: "UZ",
    population: 1978028,
    geonameId: 1512569
  },
  "Ganzhou": {
    coords: [114.9326, 25.84664],
    country: "CN",
    population: 1977253,
    geonameId: 1810638
  },
  "Almaty": {
    coords: [76.9115, 43.25249],
    country: "KZ",
    population: 1977011,
    geonameId: 1526384
  },
  "Khartoum": {
    coords: [32.53241, 15.55177],
    country: "SD",
    population: 1974647,
    geonameId: 379252
  },
  "Sapporo": {
    coords: [141.35, 43.06667],
    country: "JP",
    population: 1973832,
    geonameId: 2128295
  },
  "Accra": {
    coords: [-0.1969, 5.55602],
    country: "GH",
    population: 1963264,
    geonameId: 2306104
  },
  "Curitiba": {
    coords: [-49.27306, -25.42778],
    country: "BR",
    population: 1948626,
    geonameId: 3464975
  },
  "Ordos": {
    coords: [109.78157, 39.6086],
    country: "CN",
    population: 1940653,
    geonameId: 8347664
  },
  "Sanaa": {
    coords: [44.20646, 15.35452],
    country: "YE",
    population: 1937451,
    geonameId: 71137
  },
  "Conakry": {
    coords: [-13.67729, 9.53795],
    country: "GN",
    population: 1928389,
    geonameId: 2422465
  },
  "Tijuana": {
    coords: [-117.00371, 32.5027],
    country: "MX",
    population: 1922523,
    geonameId: 3981609
  },
  "Beirut": {
    coords: [35.50157, 33.89332],
    country: "LB",
    population: 1916100,
    geonameId: 276781
  },
  "Tangerang": {
    coords: [106.63, -6.17806],
    country: "ID",
    population: 1912679,
    geonameId: 1625084
  },
  "Jieyang": {
    coords: [116.36581, 23.5418],
    country: "CN",
    population: 1899394,
    geonameId: 1797121
  },
  "Jilin": {
    coords: [126.5608, 43.84652],
    country: "CN",
    population: 1895865,
    geonameId: 2036502
  },
  "Bucharest": {
    coords: [26.10626, 44.43225],
    country: "RO",
    population: 1877155,
    geonameId: 683506
  },
  "Camayenne": {
    coords: [-13.68778, 9.535],
    country: "GN",
    population: 1871242,
    geonameId: 2422488
  },
  "Kakamega": {
    coords: [34.75229, 0.28422],
    country: "KE",
    population: 1867579,
    geonameId: 195272
  },
  "Nanchong": {
    coords: [106.08473, 30.79508],
    country: "CN",
    population: 1858875,
    geonameId: 1800146
  },
  "Tainan": {
    coords: [120.21333, 22.99083],
    country: "TW",
    population: 1856642,
    geonameId: 1668355
  },
  "Datong": {
    coords: [113.29139, 40.09361],
    country: "CN",
    population: 1850000,
    geonameId: 2037799
  },
  "Kaduna": {
    coords: [7.43879, 10.52641],
    country: "NG",
    population: 1850000,
    geonameId: 2335727
  },
  "Omdurman": {
    coords: [32.47773, 15.64453],
    country: "SD",
    population: 1849659,
    geonameId: 365137
  },
  "Davao": {
    coords: [125.61278, 7.07306],
    country: "PH",
    population: 1848947,
    geonameId: 1715348
  },
  "Hamburg": {
    coords: [9.99302, 53.55073],
    country: "DE",
    population: 1845229,
    geonameId: 2911298
  },
  "Thane": {
    coords: [72.96355, 19.19704],
    country: "IN",
    population: 1841488,
    geonameId: 1254661
  },
  "Santa Cruz De La Sierra": {
    coords: [-63.18117, -17.78629],
    country: "BO",
    population: 1831434,
    geonameId: 3904906
  },
  "Vadodara": {
    coords: [73.20812, 22.29941],
    country: "IN",
    population: 1822221,
    geonameId: 1253573
  },
  "Adana": {
    coords: [35.32531, 36.98615],
    country: "TR",
    population: 1816750,
    geonameId: 325363
  },
  "Iztapalapa": {
    coords: [-99.06224, 19.35529],
    country: "MX",
    population: 1815786,
    geonameId: 3526683
  },
  "Nanyang": {
    coords: [112.53278, 32.99472],
    country: "CN",
    population: 1811812,
    geonameId: 1799629
  },
  "Abu Dhabi": {
    coords: [54.39696, 24.45118],
    country: "AE",
    population: 1807000,
    geonameId: 292968
  },
  "Sharjah": {
    coords: [55.41221, 25.3342],
    country: "AE",
    population: 1800000,
    geonameId: 292672
  },
  "Bhopal": {
    coords: [77.40289, 23.25469],
    country: "IN",
    population: 1798218,
    geonameId: 1275841
  },
  "Jiangmen": {
    coords: [113.08333, 22.58333],
    country: "CN",
    population: 1795459,
    geonameId: 1806299
  },
  "Diyarbakir": {
    coords: [40.21721, 37.91363],
    country: "TR",
    population: 1791373,
    geonameId: 316541
  },
  "Benin City": {
    coords: [5.62575, 6.33815],
    country: "NG",
    population: 1782000,
    geonameId: 2347283
  },
  "Jiangyin": {
    coords: [120.26302, 31.91102],
    country: "CN",
    population: 1779515,
    geonameId: 1815251
  },
  "Fuyang": {
    coords: [115.81667, 32.9],
    country: "CN",
    population: 1768947,
    geonameId: 1810845
  },
  "Montreal": {
    coords: [-73.58781, 45.50884],
    country: "CA",
    population: 1762949,
    geonameId: 6077243
  },
  "Bayan Nur": {
    coords: [107.38599, 40.74143],
    country: "CN",
    population: 1760000,
    geonameId: 11838258
  },
  "Maracaibo": {
    coords: [-71.61089, 10.64232],
    country: "VE",
    population: 1752602,
    geonameId: 3633009
  },
  "Chaozhou": {
    coords: [116.62262, 23.65396],
    country: "CN",
    population: 1750945,
    geonameId: 1815395
  },
  "Minsk": {
    coords: [27.56653, 53.90019],
    country: "BY",
    population: 1742124,
    geonameId: 625144
  },
  "Budapest": {
    coords: [19.04045, 47.49835],
    country: "HU",
    population: 1741041,
    geonameId: 3054643
  },
  "Qingyuan": {
    coords: [113.03333, 23.7],
    country: "CN",
    population: 1738424,
    geonameId: 1797945
  },
  "Tai'an": {
    coords: [117.12, 36.18528],
    country: "CN",
    population: 1735425,
    geonameId: 1793724
  },
  "Rasapudipalem": {
    coords: [83.31622, 17.73308],
    country: "IN",
    population: 1728128,
    geonameId: 1258393
  },
  "Pimpri-chinchwad": {
    coords: [73.80375, 18.61867],
    country: "IN",
    population: 1727692,
    geonameId: 7626690
  },
  "Caloocan City": {
    coords: [120.96788, 14.64953],
    country: "PH",
    population: 1712945,
    geonameId: 1720151
  },
  "Warsaw": {
    coords: [21.01178, 52.22977],
    country: "PL",
    population: 1702139,
    geonameId: 756135
  },
  "Soweto": {
    coords: [27.85849, -26.26781],
    country: "ZA",
    population: 1695047,
    geonameId: 953781
  },
  "Puebla": {
    coords: [-98.20723, 19.04778],
    country: "MX",
    population: 1692181,
    geonameId: 3521081
  },
  "Vienna": {
    coords: [16.37208, 48.20849],
    country: "AT",
    population: 1691468,
    geonameId: 2761369
  },
  "Patna": {
    coords: [85.13563, 25.59408],
    country: "IN",
    population: 1684297,
    geonameId: 1260086
  },
  "Mosul": {
    coords: [43.11889, 36.335],
    country: "IQ",
    population: 1683000,
    geonameId: 99072
  },
  "Kallakurichi": {
    coords: [78.95925, 11.73379],
    country: "IN",
    population: 1682687,
    geonameId: 12165956
  },
  "Kampala": {
    coords: [32.58219, 0.31628],
    country: "UG",
    population: 1680600,
    geonameId: 232422
  },
  "Xining": {
    coords: [101.75739, 36.62554],
    country: "CN",
    population: 1677177,
    geonameId: 1788852
  },
  "Changshu": {
    coords: [120.74221, 31.64615],
    country: "CN",
    population: 1677050,
    geonameId: 7283386
  },
  "Palembang": {
    coords: [104.7458, -2.91673],
    country: "ID",
    population: 1668848,
    geonameId: 1633070
  },
  "Huainan": {
    coords: [116.99694, 32.62639],
    country: "CN",
    population: 1666826,
    geonameId: 1807681
  },
  "Rabat": {
    coords: [-6.83255, 34.01325],
    country: "MA",
    population: 1655753,
    geonameId: 2538475
  },
  "Semarang": {
    coords: [110.42083, -6.99306],
    country: "ID",
    population: 1653524,
    geonameId: 1627896
  },
  "Recife": {
    coords: [-34.88111, -8.05389],
    country: "BR",
    population: 1653461,
    geonameId: 3390760
  },
  "Phoenix": {
    coords: [-112.07404, 33.44838],
    country: "US",
    population: 1650070,
    geonameId: 5308655
  },
  "Ecatepec De Morelos": {
    coords: [-99.06064, 19.60492],
    country: "MX",
    population: 1645352,
    geonameId: 3529612
  },
  "Lu'an": {
    coords: [116.51688, 31.73561],
    country: "CN",
    population: 1644344,
    geonameId: 1802206
  },
  "Barcelona": {
    coords: [2.15899, 41.38879],
    country: "ES",
    population: 1620343,
    geonameId: 3128760
  },
  "Valencia": {
    coords: [-68.00044, 10.16153],
    country: "VE",
    population: 1619470,
    geonameId: 3625549
  },
  "Ludhiana": {
    coords: [75.85379, 30.91204],
    country: "IN",
    population: 1618879,
    geonameId: 1264728
  },
  "Yancheng": {
    coords: [120.1573, 33.3575],
    country: "CN",
    population: 1615717,
    geonameId: 1787746
  },
  "Novosibirsk": {
    coords: [82.93175, 55.02259],
    country: "RU",
    population: 1612833,
    geonameId: 1496747
  },
  "Erbil": {
    coords: [44.00943, 36.19117],
    country: "IQ",
    population: 1612700,
    geonameId: 95446
  },
  "Fukuoka": {
    coords: [130.41667, 33.6],
    country: "JP",
    population: 1612392,
    geonameId: 1863967
  },
  "Taizhou": {
    coords: [119.90812, 32.49069],
    country: "CN",
    population: 1607108,
    geonameId: 1793505
  },
  "Daqing": {
    coords: [125, 46.58333],
    country: "CN",
    population: 1604027,
    geonameId: 2037860
  },
  "Manila": {
    coords: [120.9822, 14.6042],
    country: "PH",
    population: 1600000,
    geonameId: 1701668
  },
  "Wuhu": {
    coords: [118.42947, 31.35259],
    country: "CN",
    population: 1598165,
    geonameId: 1791236
  },
  "Santiago De Queretaro": {
    coords: [-100.38806, 20.58806],
    country: "MX",
    population: 1594212,
    geonameId: 3991164
  },
  "Dazhou": {
    coords: [107.46308, 31.2106],
    country: "CN",
    population: 1589435,
    geonameId: 1813325
  },
  "Yangzhou": {
    coords: [119.43583, 32.39722],
    country: "CN",
    population: 1584237,
    geonameId: 1787227
  },
  "Leon De Los Aldama": {
    coords: [-101.67374, 21.12908],
    country: "MX",
    population: 1579803,
    geonameId: 3998655
  },
  "Makkah": {
    coords: [39.82563, 21.42664],
    country: "SA",
    population: 1578722,
    geonameId: 104515
  },
  "Philadelphia": {
    coords: [-75.16362, 39.95238],
    country: "US",
    population: 1573916,
    geonameId: 4560349
  },
  "Phnom Penh": {
    coords: [104.91601, 11.56245],
    country: "KH",
    population: 1573544,
    geonameId: 1821306
  },
  "Guilin": {
    coords: [110.29639, 25.28022],
    country: "CN",
    population: 1572300,
    geonameId: 1809498
  },
  "Damascus": {
    coords: [36.29128, 33.5102],
    country: "SY",
    population: 1569394,
    geonameId: 170654
  },
  "Quetta": {
    coords: [67.00141, 30.18414],
    country: "PK",
    population: 1565546,
    geonameId: 1167528
  },
  "Zhaoqing": {
    coords: [112.46091, 23.04893],
    country: "CN",
    population: 1553109,
    geonameId: 1784853
  },
  "Onitsha": {
    coords: [6.78569, 6.14978],
    country: "NG",
    population: 1553000,
    geonameId: 2326016
  },
  "Mianyang": {
    coords: [104.68168, 31.46784],
    country: "CN",
    population: 1550000,
    geonameId: 1800627
  },
  "Isfahan": {
    coords: [51.67462, 32.65246],
    country: "IR",
    population: 1547164,
    geonameId: 418863
  },
  "Wanzhou": {
    coords: [108.39586, 30.76451],
    country: "CN",
    population: 1545900,
    geonameId: 12358576
  },
  "Harare": {
    coords: [31.05337, -17.82772],
    country: "ZW",
    population: 1542813,
    geonameId: 890299
  },
  "Monrovia": {
    coords: [-10.7969, 6.30054],
    country: "LR",
    population: 1542549,
    geonameId: 2274895
  },
  "Putian": {
    coords: [119.01028, 25.43944],
    country: "CN",
    population: 1539389,
    geonameId: 1798449
  },
  "Kawasaki": {
    coords: [139.71722, 35.52056],
    country: "JP",
    population: 1538262,
    geonameId: 1859642
  },
  "Shangqiu": {
    coords: [115.65, 34.45],
    country: "CN",
    population: 1536392,
    geonameId: 1783934
  },
  "Goiania": {
    coords: [-49.25389, -16.67861],
    country: "BR",
    population: 1536097,
    geonameId: 3462377
  },
  "Auckland": {
    coords: [174.76349, -36.84853],
    country: "NZ",
    population: 1530500,
    geonameId: 2193733
  },
  "San Antonio": {
    coords: [-98.49363, 29.42412],
    country: "US",
    population: 1526656,
    geonameId: 4726206
  },
  "Kobe": {
    coords: [135.183, 34.6913],
    country: "JP",
    population: 1525152,
    geonameId: 1859171
  },
  "Stockholm": {
    coords: [18.06871, 59.32938],
    country: "SE",
    population: 1515017,
    geonameId: 2673730
  },
  "Ciudad Juarez": {
    coords: [-106.46084, 31.72024],
    country: "MX",
    population: 1512450,
    geonameId: 4013708
  },
  "Can Tho": {
    coords: [105.78825, 10.03711],
    country: "VN",
    population: 1507187,
    geonameId: 1586203
  },
  "Khulna": {
    coords: [89.56439, 22.80979],
    country: "BD",
    population: 1500689,
    geonameId: 1336135
  },
  "Belem": {
    coords: [-48.50444, -1.45583],
    country: "BR",
    population: 1499641,
    geonameId: 3405870
  },
  "Yekaterinburg": {
    coords: [60.61529, 56.85733],
    country: "RU",
    population: 1495066,
    geonameId: 1486209
  },
  "Porto Alegre": {
    coords: [-51.23019, -30.03283],
    country: "BR",
    population: 1488252,
    geonameId: 3452925
  },
  "Yinchuan": {
    coords: [106.27306, 38.46806],
    country: "CN",
    population: 1487579,
    geonameId: 1786657
  },
  "Manhattan": {
    coords: [-73.96625, 40.78343],
    country: "US",
    population: 1487536,
    geonameId: 5125771
  },
  "Nashik": {
    coords: [73.79096, 19.99727],
    country: "IN",
    population: 1486053,
    geonameId: 1261731
  },
  "Asuncion": {
    coords: [-57.647, -25.28646],
    country: "PY",
    population: 1482200,
    geonameId: 3439389
  },
  "Yiwu": {
    coords: [120.07676, 29.31506],
    country: "CN",
    population: 1481384,
    geonameId: 1814870
  },
  "Zapopan": {
    coords: [-103.38742, 20.72111],
    country: "MX",
    population: 1476491,
    geonameId: 3979770
  },
  "Daejeon": {
    coords: [127.38493, 36.34913],
    country: "KR",
    population: 1470336,
    geonameId: 1835235
  },
  "Adelaide": {
    coords: [138.59863, -34.92866],
    country: "AU",
    population: 1469163,
    geonameId: 2078025
  },
  "Quanzhou": {
    coords: [118.58583, 24.91389],
    country: "CN",
    population: 1469157,
    geonameId: 1797353
  },
  "Madurai": {
    coords: [78.11953, 9.919],
    country: "IN",
    population: 1465625,
    geonameId: 1264521
  },
  "Jinhua": {
    coords: [119.64421, 29.10678],
    country: "CN",
    population: 1463990,
    geonameId: 1805528
  },
  "Kyoto": {
    coords: [135.75385, 35.02107],
    country: "JP",
    population: 1463723,
    geonameId: 1857910
  },
  "Cixi": {
    coords: [121.2457, 30.1764],
    country: "CN",
    population: 1457510,
    geonameId: 1806602
  },
  "Changde": {
    coords: [111.69844, 29.03205],
    country: "CN",
    population: 1457419,
    geonameId: 1791121
  },
  "Kuala Lumpur": {
    coords: [101.68653, 3.1412],
    country: "MY",
    population: 1453975,
    geonameId: 1735161
  },
  "Kaifeng": {
    coords: [114.30742, 34.7986],
    country: "CN",
    population: 1451741,
    geonameId: 1804879
  },
  "Anshan": {
    coords: [122.99, 41.12361],
    country: "CN",
    population: 1450000,
    geonameId: 2038632
  },
  "Karaj": {
    coords: [50.99155, 35.83266],
    country: "IR",
    population: 1448075,
    geonameId: 128747
  },
  "Kathmandu": {
    coords: [85.3206, 27.70169],
    country: "NP",
    population: 1442271,
    geonameId: 1283240
  },
  "Baoji": {
    coords: [107.23705, 34.36775],
    country: "CN",
    population: 1437802,
    geonameId: 10942359
  },
  "Suqian": {
    coords: [118.29583, 33.94917],
    country: "CN",
    population: 1437685,
    geonameId: 1793771
  },
  "Liuzhou": {
    coords: [109.40698, 24.32405],
    country: "CN",
    population: 1436599,
    geonameId: 1803300
  },
  "Tirunelveli": {
    coords: [77.6838, 8.72742],
    country: "IN",
    population: 1435844,
    geonameId: 1254361
  },
  "Kayseri": {
    coords: [35.48528, 38.73222],
    country: "TR",
    population: 1434357,
    geonameId: 308464
  },
  "Kharkiv": {
    coords: [36.25475, 49.98177],
    country: "UA",
    population: 1433886,
    geonameId: 706483
  },
  "Konya": {
    coords: [32.48464, 37.87135],
    country: "TR",
    population: 1433861,
    geonameId: 306571
  },
  "Zhangjiagang": {
    coords: [120.53889, 31.865],
    country: "CN",
    population: 1432044,
    geonameId: 1787331
  },
  "Agra": {
    coords: [78.01667, 27.18333],
    country: "IN",
    population: 1430055,
    geonameId: 1279259
  },
  "Tabriz": {
    coords: [46.2919, 38.08],
    country: "IR",
    population: 1424641,
    geonameId: 113646
  },
  "Makassar": {
    coords: [119.43194, -5.14861],
    country: "ID",
    population: 1423877,
    geonameId: 1622786
  },
  "Jinjiang": {
    coords: [118.57415, 24.81978],
    country: "CN",
    population: 1416151,
    geonameId: 1797658
  },
  "Faridabad": {
    coords: [77.31316, 28.41124],
    country: "IN",
    population: 1414050,
    geonameId: 1271951
  },
  "Bozhou": {
    coords: [115.77028, 33.87722],
    country: "CN",
    population: 1409436,
    geonameId: 1816234
  },
  "Qujing": {
    coords: [103.78333, 25.48333],
    country: "CN",
    population: 1408500,
    geonameId: 1797318
  },
  "South Tangerang": {
    coords: [106.71789, -6.28862],
    country: "ID",
    population: 1404785,
    geonameId: 8581443
  },
  "San Diego": {
    coords: [-117.16472, 32.71571],
    country: "US",
    population: 1404452,
    geonameId: 5391811
  },
  "Zhanjiang": {
    coords: [110.38749, 21.23391],
    country: "CN",
    population: 1400709,
    geonameId: 1784990
  },
  "Fushun": {
    coords: [123.94363, 41.88669],
    country: "CN",
    population: 1400646,
    geonameId: 2037355
  },
  "Gwangju": {
    coords: [126.91556, 35.15472],
    country: "KR",
    population: 1398538,
    geonameId: 1841811
  },
  "Rajkot": {
    coords: [70.79322, 22.29161],
    country: "IN",
    population: 1390640,
    geonameId: 1258847
  },
  "Luoyang": {
    coords: [112.43684, 34.67345],
    country: "CN",
    population: 1390581,
    geonameId: 1801792
  },
  "Guadalajara": {
    coords: [-103.34749, 20.67738],
    country: "MX",
    population: 1385629,
    geonameId: 4005539
  },
  "The Bronx": {
    coords: [-73.86641, 40.84985],
    country: "US",
    population: 1385108,
    geonameId: 5110266
  },
  "Guankou": {
    coords: [113.62709, 28.15861],
    country: "CN",
    population: 1380000,
    geonameId: 1802875
  },
  "Hue": {
    coords: [107.59546, 16.4619],
    country: "VN",
    population: 1380000,
    geonameId: 1580240
  },
  "Milan": {
    coords: [9.18951, 45.46427],
    country: "IT",
    population: 1371498,
    geonameId: 3173435
  },
  "Najafgarh": {
    coords: [76.97982, 28.60922],
    country: "IN",
    population: 1365000,
    geonameId: 1262111
  },
  "N'djamena": {
    coords: [15.0444, 12.10672],
    country: "TD",
    population: 1359526,
    geonameId: 2427123
  },
  "Handan": {
    coords: [114.48764, 36.60999],
    country: "CN",
    population: 1358318,
    geonameId: 1808963
  },
  "Bannu": {
    coords: [70.60403, 32.98527],
    country: "PK",
    population: 1357890,
    geonameId: 1183460
  },
  "Yichang": {
    coords: [111.28472, 30.71444],
    country: "CN",
    population: 1350150,
    geonameId: 1786764
  },
  "Antananarivo": {
    coords: [47.53613, -18.91368],
    country: "MG",
    population: 1349501,
    geonameId: 1070940
  },
  "Heze": {
    coords: [115.47358, 35.23929],
    country: "CN",
    population: 1346717,
    geonameId: 1808198
  },
  "Antalya": {
    coords: [30.69556, 36.90812],
    country: "TR",
    population: 1344000,
    geonameId: 323777
  },
  "Abobo": {
    coords: [-4.0159, 5.41613],
    country: "CI",
    population: 1340083,
    geonameId: 2293521
  },
  "Jamshedpur": {
    coords: [86.18545, 22.80278],
    country: "IN",
    population: 1339438,
    geonameId: 1269300
  },
  "Douala": {
    coords: [9.70428, 4.04827],
    country: "CM",
    population: 1338082,
    geonameId: 2232593
  },
  "Basrah": {
    coords: [47.7804, 30.50852],
    country: "IQ",
    population: 1326564,
    geonameId: 99532
  },
  "Dallas": {
    coords: [-96.80667, 32.78306],
    country: "US",
    population: 1326087,
    geonameId: 4684888
  },
  "Saitama": {
    coords: [139.65657, 35.90807],
    country: "JP",
    population: 1324854,
    geonameId: 6940394
  },
  "Gorakhpur": {
    coords: [75.67206, 29.44768],
    country: "IN",
    population: 1324570,
    geonameId: 1270926
  },
  "Niamey": {
    coords: [2.1098, 13.51366],
    country: "NE",
    population: 1323691,
    geonameId: 2440485
  },
  "Liupanshui": {
    coords: [104.83333, 26.59444],
    country: "CN",
    population: 1320825,
    geonameId: 8533133
  },
  "Taguig": {
    coords: [121.0792, 14.5243],
    country: "PH",
    population: 1308085,
    geonameId: 1684308
  },
  "Maoming": {
    coords: [110.91364, 21.66625],
    country: "CN",
    population: 1307802,
    geonameId: 1801180
  },
  "Calgary": {
    coords: [-114.08529, 51.05011],
    country: "CA",
    population: 1306784,
    geonameId: 5913490
  },
  "Tripoli": {
    coords: [13.18733, 32.88743],
    country: "LY",
    population: 1302947,
    geonameId: 2210247
  },
  "Callao": {
    coords: [-77.13452, -12.05162],
    country: "PE",
    population: 1300000,
    geonameId: 3946083
  },
  "Madinah": {
    coords: [39.61417, 24.46861],
    country: "SA",
    population: 1300000,
    geonameId: 109223
  },
  "Yaounde": {
    coords: [11.51667, 3.86667],
    country: "CM",
    population: 1299369,
    geonameId: 2220957
  },
  "Qinzhou": {
    coords: [108.65061, 21.98247],
    country: "CN",
    population: 1296300,
    geonameId: 1797551
  },
  "Luohe": {
    coords: [114.04272, 33.56394],
    country: "CN",
    population: 1294974,
    geonameId: 1801934
  },
  "Xiangyang": {
    coords: [112.14479, 32.0422],
    country: "CN",
    population: 1294733,
    geonameId: 1790587
  },
  "Yangjiang": {
    coords: [111.96272, 21.85563],
    country: "CN",
    population: 1292987,
    geonameId: 1806408
  },
  "Yixing": {
    coords: [119.82016, 31.36059],
    country: "CN",
    population: 1285785,
    geonameId: 1786760
  },
  "Pimpri": {
    coords: [73.80696, 18.62292],
    country: "IN",
    population: 1284606,
    geonameId: 1259652
  },
  "Da Nang": {
    coords: [108.22083, 16.06778],
    country: "VN",
    population: 1276000,
    geonameId: 1583992
  },
  "Amman": {
    coords: [35.94503, 31.95522],
    country: "JO",
    population: 1275857,
    geonameId: 250441
  },
  "Budta": {
    coords: [124.43972, 7.20417],
    country: "PH",
    population: 1273715,
    geonameId: 1723510
  },
  "Belgrade": {
    coords: [20.46513, 44.80401],
    country: "RS",
    population: 1273651,
    geonameId: 792680
  },
  "Bien Hoa": {
    coords: [106.82432, 10.94469],
    country: "VN",
    population: 1272235,
    geonameId: 1587923
  },
  "Montevideo": {
    coords: [-56.18816, -34.90328],
    country: "UY",
    population: 1270737,
    geonameId: 3441575
  },
  "Xuchang": {
    coords: [113.86299, 34.03189],
    country: "CN",
    population: 1265536,
    geonameId: 1788046
  },
  "Kalyan": {
    coords: [73.13554, 19.2437],
    country: "IN",
    population: 1262255,
    geonameId: 1268295
  },
  "Zigong": {
    coords: [104.77689, 29.34162],
    country: "CN",
    population: 1262064,
    geonameId: 1783745
  },
  "Munich": {
    coords: [11.57549, 48.13743],
    country: "DE",
    population: 1260391,
    geonameId: 2867714
  },
  "Nizhniy Novgorod": {
    coords: [44.00205, 56.32867],
    country: "RU",
    population: 1259013,
    geonameId: 520555
  },
  "Jepara": {
    coords: [110.671, -6.5924],
    country: "ID",
    population: 1257912,
    geonameId: 1642548
  },
  "Maputo": {
    coords: [32.58322, -25.96553],
    country: "MZ",
    population: 1254837,
    geonameId: 1040652
  },
  "Xuzhou": {
    coords: [117.28386, 34.20442],
    country: "CN",
    population: 1253991,
    geonameId: 10630003
  },
  "Dammam": {
    coords: [50.10326, 26.43442],
    country: "SA",
    population: 1252523,
    geonameId: 110336
  },
  "Ra's Bayrut": {
    coords: [35.48333, 33.9],
    country: "LB",
    population: 1251739,
    geonameId: 268743
  },
  "Neijiang": {
    coords: [105.06216, 29.58354],
    country: "CN",
    population: 1251095,
    geonameId: 1799491
  },
  "Shiraz": {
    coords: [52.53113, 29.61031],
    country: "IR",
    population: 1249942,
    geonameId: 115019
  },
  "Heshan": {
    coords: [112.34733, 28.56938],
    country: "CN",
    population: 1249807,
    geonameId: 1808316
  },
  "Dombivali": {
    coords: [73.08333, 19.21667],
    country: "IN",
    population: 1247327,
    geonameId: 1272423
  },
  "Kananga": {
    coords: [22.41659, -5.89624],
    country: "CD",
    population: 1247168,
    geonameId: 214481
  },
  "Kazan": {
    coords: [49.12214, 55.78874],
    country: "RU",
    population: 1243500,
    geonameId: 551487
  },
  "Jining": {
    coords: [116.58139, 35.405],
    country: "CN",
    population: 1241012,
    geonameId: 1805518
  },
  "Barquisimeto": {
    coords: [-69.35703, 10.0647],
    country: "VE",
    population: 1240714,
    geonameId: 3648522
  },
  "Shubra Al Khaymah": {
    coords: [31.25053, 30.12511],
    country: "EG",
    population: 1240289,
    geonameId: 349076
  },
  "Port-au-prince": {
    coords: [-72.33881, 18.54349],
    country: "HT",
    population: 1234742,
    geonameId: 3718426
  },
  "Xinyang": {
    coords: [114.06556, 32.12278],
    country: "CN",
    population: 1230042,
    geonameId: 1788534
  },
  "Liaocheng": {
    coords: [116.00247, 36.45064],
    country: "CN",
    population: 1229768,
    geonameId: 1803834
  },
  "Jinzhong": {
    coords: [112.75471, 37.68403],
    country: "CN",
    population: 1226617,
    geonameId: 10942283
  },
  "Meerut": {
    coords: [77.70636, 28.98002],
    country: "IN",
    population: 1223184,
    geonameId: 1263214
  },
  "Virar": {
    coords: [72.81136, 19.45591],
    country: "IN",
    population: 1222390,
    geonameId: 1253133
  },
  "Nowrangapur": {
    coords: [82.54826, 19.23114],
    country: "IN",
    population: 1220946,
    geonameId: 1261162
  },
  "Karbala": {
    coords: [44.02488, 32.61603],
    country: "IQ",
    population: 1218732,
    geonameId: 94824
  },
  "Changzhi": {
    coords: [113.10528, 36.18389],
    country: "CN",
    population: 1214940,
    geonameId: 1808956
  },
  "Tianshui": {
    coords: [105.74238, 34.57952],
    country: "CN",
    population: 1212791,
    geonameId: 1792892
  },
  "Mombasa": {
    coords: [39.66359, -4.05466],
    country: "KE",
    population: 1208333,
    geonameId: 186301
  },
  "Mandalay": {
    coords: [96.08359, 21.97473],
    country: "MM",
    population: 1208099,
    geonameId: 1311874
  },
  "Srinagar": {
    coords: [74.80555, 34.08565],
    country: "IN",
    population: 1206419,
    geonameId: 1255634
  },
  "Barranquilla": {
    coords: [-74.78132, 10.96854],
    country: "CO",
    population: 1206319,
    geonameId: 3689147
  },
  "Chelyabinsk": {
    coords: [61.42877, 55.1611],
    country: "RU",
    population: 1202371,
    geonameId: 1508291
  },
  "Merida": {
    coords: [-89.62318, 20.967],
    country: "MX",
    population: 1201000,
    geonameId: 3523349
  },
  "Hiroshima": {
    coords: [132.45, 34.4],
    country: "JP",
    population: 1200754,
    geonameId: 1862415
  },
  "Santiago De Los Caballeros": {
    coords: [-70.69085, 19.45036],
    country: "DO",
    population: 1200000,
    geonameId: 3492914
  },
  "Shymkent": {
    coords: [69.60042, 42.30988],
    country: "KZ",
    population: 1200000,
    geonameId: 1518980
  },
  "Weinan": {
    coords: [109.50891, 34.50355],
    country: "CN",
    population: 1199290,
    geonameId: 1791636
  },
  "Ghaziabad": {
    coords: [77.43915, 28.66535],
    country: "IN",
    population: 1199191,
    geonameId: 1271308
  },
  "Matola": {
    coords: [32.45889, -25.96222],
    country: "MZ",
    population: 1198988,
    geonameId: 1039854
  },
  "Dhanbad": {
    coords: [86.42992, 23.79759],
    country: "IN",
    population: 1196214,
    geonameId: 1272979
  },
  "Hong Kong Island": {
    coords: [114.18419, 22.26302],
    country: "HK",
    population: 1195529,
    geonameId: 12747064
  },
  "Fes": {
    coords: [-5.00028, 34.03313],
    country: "MA",
    population: 1191905,
    geonameId: 2548885
  },
  "Suwon": {
    coords: [127.00889, 37.29111],
    country: "KR",
    population: 1191063,
    geonameId: 1835553
  },
  "Gustavo Adolfo Madero": {
    coords: [-99.11075, 19.49392],
    country: "MX",
    population: 1185772,
    geonameId: 3514674
  },
  "Nouakchott": {
    coords: [-15.9785, 18.08581],
    country: "MR",
    population: 1184530,
    geonameId: 2377450
  },
  "Kisangani": {
    coords: [25.19099, 0.51528],
    country: "CD",
    population: 1181788,
    geonameId: 212730
  },
  "Jiaxing": {
    coords: [120.75, 30.7522],
    country: "CN",
    population: 1180000,
    geonameId: 1805953
  },
  "Aurangabad": {
    coords: [75.34226, 19.87757],
    country: "IN",
    population: 1175116,
    geonameId: 1278149
  },
  "Omsk": {
    coords: [73.36859, 54.99244],
    country: "RU",
    population: 1172070,
    geonameId: 1496153
  },
  "Guarulhos": {
    coords: [-46.53333, -23.46278],
    country: "BR",
    population: 1169577,
    geonameId: 3461786
  },
  "Bandar Lampung": {
    coords: [105.26111, -5.42917],
    country: "ID",
    population: 1166066,
    geonameId: 1624917
  },
  "Prague": {
    coords: [14.42076, 50.08804],
    country: "CZ",
    population: 1165581,
    geonameId: 3067696
  },
  "Varanasi": {
    coords: [83.01041, 25.31668],
    country: "IN",
    population: 1164404,
    geonameId: 1253405
  },
  "Batam": {
    coords: [104.02491, 1.14937],
    country: "ID",
    population: 1164352,
    geonameId: 6295587
  },
  "Jiujiang": {
    coords: [116.00206, 29.70475],
    country: "CN",
    population: 1164268,
    geonameId: 1805179
  },
  "Samara": {
    coords: [50.13553, 53.20767],
    country: "RU",
    population: 1163399,
    geonameId: 499099
  },
  "Aba": {
    coords: [7.36667, 5.10658],
    country: "NG",
    population: 1160000,
    geonameId: 2353151
  },
  "Amritsar": {
    coords: [74.87534, 31.62234],
    country: "IN",
    population: 1159227,
    geonameId: 1278710
  },
  "Birmingham": {
    coords: [-1.89983, 52.48142],
    country: "GB",
    population: 1157603,
    geonameId: 2655603
  },
  "Copenhagen": {
    coords: [12.56553, 55.67594],
    country: "DK",
    population: 1153615,
    geonameId: 2618425
  },
  "Sofia": {
    coords: [23.32415, 42.69751],
    country: "BG",
    population: 1152556,
    geonameId: 727011
  },
  "Anyang": {
    coords: [114.38278, 36.096],
    country: "CN",
    population: 1146839,
    geonameId: 1785294
  },
  "Luohu District": {
    coords: [114.13149, 22.54721],
    country: "CN",
    population: 1143801,
    geonameId: 13405906
  },
  "Vijayawada": {
    coords: [80.6466, 16.50745],
    country: "IN",
    population: 1143232,
    geonameId: 1253184
  },
  "Yerevan": {
    coords: [44.5126, 40.17765],
    country: "AM",
    population: 1141100,
    geonameId: 616052
  },
  "Bijie": {
    coords: [105.28627, 27.30193],
    country: "CN",
    population: 1137383,
    geonameId: 1816373
  },
  "Monterrey": {
    coords: [-100.31721, 25.68435],
    country: "MX",
    population: 1135512,
    geonameId: 3995465
  },
  "Kigali": {
    coords: [30.05885, -1.94995],
    country: "RW",
    population: 1132686,
    geonameId: 202061
  },
  "Rostov-na-donu": {
    coords: [39.70769, 47.21997],
    country: "RU",
    population: 1130305,
    geonameId: 501175
  },
  "Zhuzhou": {
    coords: [113.15, 27.83333],
    country: "CN",
    population: 1129687,
    geonameId: 1783763
  },
  "Bogor": {
    coords: [106.78917, -6.59444],
    country: "ID",
    population: 1127408,
    geonameId: 1648473
  },
  "Malingao": {
    coords: [124.475, 7.16083],
    country: "PH",
    population: 1121974,
    geonameId: 1978681
  },
  "Touba": {
    coords: [-15.88333, 14.85],
    country: "SN",
    population: 1120824,
    geonameId: 2244322
  },
  "Ufa": {
    coords: [55.96779, 54.74306],
    country: "RU",
    population: 1120547,
    geonameId: 479561
  },
  "Ranchi": {
    coords: [85.3094, 23.34316],
    country: "IN",
    population: 1120374,
    geonameId: 1258526
  },
  "Baku": {
    coords: [49.89201, 40.37767],
    country: "AZ",
    population: 1116513,
    geonameId: 587084
  },
  "Shangrao": {
    coords: [117.94287, 28.45179],
    country: "CN",
    population: 1116486,
    geonameId: 1787858
  },
  "Lilongwe": {
    coords: [33.78725, -13.96692],
    country: "MW",
    population: 1115815,
    geonameId: 927967
  },
  "Huaibei": {
    coords: [116.79167, 33.97444],
    country: "CN",
    population: 1113321,
    geonameId: 1807700
  },
  "Maiduguri": {
    coords: [13.15712, 11.84692],
    country: "NG",
    population: 1110000,
    geonameId: 2331447
  },
  "Meishan": {
    coords: [103.83696, 30.04392],
    country: "CN",
    population: 1107742,
    geonameId: 1800818
  },
  "Ciudad Nezahualcoyotl": {
    coords: [-99.01483, 19.40061],
    country: "MX",
    population: 1104585,
    geonameId: 3530589
  },
  "Mwanza": {
    coords: [32.9, -2.51667],
    country: "TZ",
    population: 1104521,
    geonameId: 152224
  },
  "Sendai": {
    coords: [140.86667, 38.26667],
    country: "JP",
    population: 1096704,
    geonameId: 2111149
  },
  "Ulsan": {
    coords: [129.31667, 35.53722],
    country: "KR",
    population: 1095014,
    geonameId: 1833747
  },
  "Krasnoyarsk": {
    coords: [92.93136, 56.03742],
    country: "RU",
    population: 1090811,
    geonameId: 1502026
  },
  "Guigang": {
    coords: [109.59472, 23.11603],
    country: "CN",
    population: 1086327,
    geonameId: 1809532
  },
  "Pekanbaru": {
    coords: [101.44167, 0.51667],
    country: "ID",
    population: 1085000,
    geonameId: 1631761
  },
  "Oslo": {
    coords: [10.74609, 59.91273],
    country: "NO",
    population: 1082575,
    geonameId: 3143244
  },
  "Jabalpur": {
    coords: [79.95006, 23.16697],
    country: "IN",
    population: 1081677,
    geonameId: 1269633
  },
  "Ilorin": {
    coords: [4.54214, 8.49664],
    country: "NG",
    population: 1080000,
    geonameId: 2337639
  },
  "Aden": {
    coords: [45.03852, 12.77957],
    country: "YE",
    population: 1079670,
    geonameId: 415189
  },
  "Hengyang": {
    coords: [112.61888, 26.88946],
    country: "CN",
    population: 1075516,
    geonameId: 1808370
  },
  "Prayagraj": {
    coords: [81.84322, 25.44478],
    country: "IN",
    population: 1073438,
    geonameId: 1278994
  },
  "Visakhapatnam": {
    coords: [83.20161, 17.68009],
    country: "IN",
    population: 1063178,
    geonameId: 1253102
  },
  "Goyang-si": {
    coords: [126.835, 37.65639],
    country: "KR",
    population: 1061752,
    geonameId: 1842485
  },
  "Yulin": {
    coords: [110.14686, 22.6305],
    country: "CN",
    population: 1056743,
    geonameId: 1785781
  },
  "Jodhpur": {
    coords: [73.00594, 26.26841],
    country: "IN",
    population: 1056191,
    geonameId: 1268865
  },
  "Gwalior": {
    coords: [78.17337, 26.22983],
    country: "IN",
    population: 1054420,
    geonameId: 1270583
  },
  "Jingzhou": {
    coords: [112.19028, 30.35028],
    country: "CN",
    population: 1052282,
    geonameId: 1805540
  },
  "Port Elizabeth": {
    coords: [25.61494, -33.96109],
    country: "ZA",
    population: 1050078,
    geonameId: 964420
  },
  "Tbilisi": {
    coords: [44.83412, 41.69143],
    country: "GE",
    population: 1049498,
    geonameId: 611717
  },
  "Voronezh": {
    coords: [39.19204, 51.66833],
    country: "RU",
    population: 1047549,
    geonameId: 472045
  },
  "Xinxiang": {
    coords: [113.80151, 35.19033],
    country: "CN",
    population: 1047088,
    geonameId: 1788572
  },
  "Yichun": {
    coords: [114.4, 27.83333],
    country: "CN",
    population: 1045952,
    geonameId: 1786746
  },
  "Sokoto": {
    coords: [5.24322, 13.06269],
    country: "NG",
    population: 1040000,
    geonameId: 2322911
  },
  "Jos": {
    coords: [8.89212, 9.92849],
    country: "NG",
    population: 1040000,
    geonameId: 2335953
  },
  "Tangier": {
    coords: [-5.79975, 35.76727],
    country: "MA",
    population: 1035141,
    geonameId: 2530335
  },
  "Teni": {
    coords: [77.47772, 10.01115],
    country: "IN",
    population: 1034724,
    geonameId: 1254745
  },
  "Xianyang": {
    coords: [108.70261, 34.33778],
    country: "CN",
    population: 1034081,
    geonameId: 1790353
  },
  "Mexicali": {
    coords: [-115.45446, 32.62781],
    country: "MX",
    population: 1032686,
    geonameId: 3996069
  },
  "Pointe-noire": {
    coords: [11.86352, -4.77609],
    country: "CG",
    population: 1032000,
    geonameId: 2255414
  },
  "Maceio": {
    coords: [-35.73528, -9.66583],
    country: "BR",
    population: 1031597,
    geonameId: 3395981
  },
  "Campinas": {
    coords: [-47.06083, -22.90556],
    country: "BR",
    population: 1031554,
    geonameId: 3467865
  },
  "Sanya": {
    coords: [109.50947, 18.25435],
    country: "CN",
    population: 1031396,
    geonameId: 1796556
  },
  "Rangpur": {
    coords: [89.25166, 25.74664],
    country: "BD",
    population: 1031388,
    geonameId: 1185188
  },
  "Kirkuk": {
    coords: [44.39222, 35.46806],
    country: "IQ",
    population: 1031000,
    geonameId: 94787
  },
  "Comilla": {
    coords: [91.18503, 23.46186],
    country: "BD",
    population: 1030000,
    geonameId: 1185186
  },
  "Shaoguan": {
    coords: [113.58333, 24.8],
    country: "CN",
    population: 1028460,
    geonameId: 1795874
  },
  "Howrah": {
    coords: [88.31857, 22.57688],
    country: "IN",
    population: 1027672,
    geonameId: 1270396
  },
  "Raipur": {
    coords: [81.63333, 21.23333],
    country: "IN",
    population: 1027264,
    geonameId: 1258980
  },
  "Changwon": {
    coords: [128.68111, 35.22806],
    country: "KR",
    population: 1025702,
    geonameId: 1846326
  },
  "Longyan": {
    coords: [117.01775, 25.07485],
    country: "CN",
    population: 1025087,
    geonameId: 1802276
  },
  "Dublin": {
    coords: [-6.24889, 53.33306],
    country: "IE",
    population: 1024027,
    geonameId: 2964574
  },
  "Tiruchirappalli": {
    coords: [78.69651, 10.8155],
    country: "IN",
    population: 1022518,
    geonameId: 1254388
  },
  "Yongzhou": {
    coords: [111.61306, 26.42389],
    country: "CN",
    population: 1020715,
    geonameId: 1786217
  },
  "Brussels": {
    coords: [4.34878, 50.85045],
    country: "BE",
    population: 1019022,
    geonameId: 2800866
  },
  "Zamboanga": {
    coords: [122.07389, 6.91028],
    country: "PH",
    population: 1018849,
    geonameId: 1679432
  },
  "Ottawa": {
    coords: [-75.69812, 45.41117],
    country: "CA",
    population: 1017449,
    geonameId: 6094817
  },
  "Huzhou": {
    coords: [120.0933, 30.8703],
    country: "CN",
    population: 1015937,
    geonameId: 1806535
  },
  "Odesa": {
    coords: [30.74383, 46.48572],
    country: "UA",
    population: 1015826,
    geonameId: 698740
  },
  "Volgograd": {
    coords: [44.4976, 48.71378],
    country: "RU",
    population: 1013533,
    geonameId: 472757
  },
  "Khartoum North": {
    coords: [32.53458, 15.64925],
    country: "SD",
    population: 1012211,
    geonameId: 379251
  },
  "Edmonton": {
    coords: [-113.46871, 53.55014],
    country: "CA",
    population: 1010899,
    geonameId: 5946768
  },
  "Wuwei": {
    coords: [102.63202, 37.92672],
    country: "CN",
    population: 1010295,
    geonameId: 1803936
  },
  "Jacksonville": {
    coords: [-81.65565, 30.33218],
    country: "US",
    population: 1009833,
    geonameId: 4160021
  },
  "Arequipa": {
    coords: [-71.53747, -16.39899],
    country: "PE",
    population: 1008290,
    geonameId: 3947322
  },
  "Fort Worth": {
    coords: [-97.32085, 32.72541],
    country: "US",
    population: 1008106,
    geonameId: 4691930
  },
  "Hanzhong": {
    coords: [107.02214, 33.07507],
    country: "CN",
    population: 1006557,
    geonameId: 1808857
  },
  "Hezhou": {
    coords: [111.56675, 24.40357],
    country: "CN",
    population: 1005490,
    geonameId: 7576887
  },
  "Kota": {
    coords: [75.83907, 25.18254],
    country: "IN",
    population: 1001694,
    geonameId: 1266049
  },
  "Zhu Cheng City": {
    coords: [119.40259, 35.99502],
    country: "CN",
    population: 1000000,
    geonameId: 7602670
  },
  "Shivaji Nagar": {
    coords: [73.85263, 18.53017],
    country: "IN",
    population: 1000000,
    geonameId: 6943660
  },
  "Dongying": {
    coords: [118.49165, 37.46271],
    country: "CN",
    population: 998968,
    geonameId: 1812101
  },
  "Luzhou": {
    coords: [105.42575, 28.8903],
    country: "CN",
    population: 998900,
    geonameId: 1801640
  },
  "San Jose": {
    coords: [-121.89496, 37.33939],
    country: "US",
    population: 997368,
    geonameId: 5392171
  },
  "Sholapur": {
    coords: [75.91044, 17.67152],
    country: "IN",
    population: 997281,
    geonameId: 1256436
  },
  "Marrakesh": {
    coords: [-7.99994, 31.63416],
    country: "MA",
    population: 995871,
    geonameId: 2542997
  },
  "Guatemala City": {
    coords: [-90.51327, 14.64072],
    country: "GT",
    population: 994938,
    geonameId: 3598132
  },
  "Meizhou": {
    coords: [116.11768, 24.28859],
    country: "CN",
    population: 992351,
    geonameId: 1800779
  },
  "Yueyang": {
    coords: [113.09481, 29.37455],
    country: "CN",
    population: 991465,
    geonameId: 1927639
  },
  "Laiwu": {
    coords: [117.65694, 36.19278],
    country: "CN",
    population: 989535,
    geonameId: 1804591
  },
  "Benxi": {
    coords: [123.765, 41.28861],
    country: "CN",
    population: 987717,
    geonameId: 2038300
  },
  "Perm": {
    coords: [56.25017, 58.01046],
    country: "RU",
    population: 982419,
    geonameId: 511196
  },
  "Zaria": {
    coords: [7.7227, 11.11128],
    country: "NG",
    population: 980000,
    geonameId: 2317765
  },
  "Chiba": {
    coords: [140.11667, 35.6],
    country: "JP",
    population: 979768,
    geonameId: 2113015
  },
  "Pingdingshan": {
    coords: [113.30119, 33.73847],
    country: "CN",
    population: 979130,
    geonameId: 1798827
  },
  "Ciudad Guayana": {
    coords: [-62.64102, 8.35122],
    country: "VE",
    population: 978202,
    geonameId: 3645528
  },
  "Sargodha": {
    coords: [72.67418, 32.08586],
    country: "PK",
    population: 975886,
    geonameId: 1166000
  },
  "Austin": {
    coords: [-97.74306, 30.26715],
    country: "US",
    population: 974447,
    geonameId: 4671654
  },
  "Managua": {
    coords: [-86.2504, 12.13282],
    country: "NI",
    population: 973087,
    geonameId: 3617763
  },
  "Bengbu": {
    coords: [117.36083, 32.94083],
    country: "CN",
    population: 972784,
    geonameId: 1816440
  },
  "Sale": {
    coords: [-6.79846, 34.0531],
    country: "MA",
    population: 972299,
    geonameId: 2537763
  },
  "Jerusalem": {
    coords: [35.21633, 31.76904],
    country: "IL",
    population: 971800,
    geonameId: 281184
  },
  "Chandigarh": {
    coords: [76.7884, 30.73629],
    country: "IN",
    population: 970602,
    geonameId: 1274746
  },
  "Dnipro": {
    coords: [35.04066, 48.46664],
    country: "UA",
    population: 968502,
    geonameId: 709930
  },
  "Cebu City": {
    coords: [123.89071, 10.31672],
    country: "PH",
    population: 965332,
    geonameId: 1717512
  },
  "Koeln": {
    coords: [6.95, 50.93333],
    country: "DE",
    population: 963395,
    geonameId: 2886242
  },
  "Tiruppur": {
    coords: [77.35456, 11.11541],
    country: "IN",
    population: 963173,
    geonameId: 1254348
  },
  "Guwahati": {
    coords: [91.7458, 26.1844],
    country: "IN",
    population: 962334,
    geonameId: 1271476
  },
  "Xiangtan": {
    coords: [112.9, 27.85],
    country: "CN",
    population: 959303,
    geonameId: 1790492
  },
  "Linfen": {
    coords: [111.51889, 36.08889],
    country: "CN",
    population: 959198,
    geonameId: 1803567
  },
  "Victoria": {
    coords: [114.14417, 22.2875],
    country: "HK",
    population: 956800,
    geonameId: 1931681
  },
  "Zhenjiang": {
    coords: [119.45508, 32.21086],
    country: "CN",
    population: 950516,
    geonameId: 1784642
  },
  "Enugu": {
    coords: [7.49883, 6.44132],
    country: "NG",
    population: 950000,
    geonameId: 2343279
  },
  "Rosario": {
    coords: [-60.63932, -32.94682],
    country: "AR",
    population: 948312,
    geonameId: 3838583
  },
  "Sultanah": {
    coords: [39.58572, 24.49258],
    country: "SA",
    population: 946697,
    geonameId: 101760
  },
  "Huludao": {
    coords: [120.83552, 40.75243],
    country: "CN",
    population: 944495,
    geonameId: 2036662
  },
  "Hubballi": {
    coords: [75.13378, 15.34776],
    country: "IN",
    population: 943788,
    geonameId: 1269920
  },
  "Kitakyushu": {
    coords: [130.85034, 33.85181],
    country: "JP",
    population: 940978,
    geonameId: 1859307
  },
  "Taiz": {
    coords: [44.02091, 13.57952],
    country: "YE",
    population: 940600,
    geonameId: 70225
  },
  "Setagaya": {
    coords: [139.64715, 35.64188],
    country: "JP",
    population: 940071,
    geonameId: 11790342
  },
  "Kingston": {
    coords: [-76.79358, 17.99702],
    country: "JM",
    population: 937700,
    geonameId: 3489854
  },
  "Baoshan": {
    coords: [99.16366, 25.11626],
    country: "CN",
    population: 935618,
    geonameId: 1281673
  },
  "Rui'an": {
    coords: [120.65859, 27.77605],
    country: "CN",
    population: 927383,
    geonameId: 1797063
  },
  "Chihuahua": {
    coords: [-106.08889, 28.63528],
    country: "MX",
    population: 925762,
    geonameId: 4014338
  },
  "Nay Pyi Taw": {
    coords: [96.12972, 19.745],
    country: "MM",
    population: 925000,
    geonameId: 6611854
  },
  "Mysuru": {
    coords: [76.63925, 12.29791],
    country: "IN",
    population: 920550,
    geonameId: 1262321
  },
  "Trujillo": {
    coords: [-79.02998, -8.11599],
    country: "PE",
    population: 919899,
    geonameId: 3691175
  },
  "Salem": {
    coords: [78.15538, 11.65376],
    country: "IN",
    population: 917414,
    geonameId: 1257629
  },
  "Sao Luis": {
    coords: [-44.30278, -2.52972],
    country: "BR",
    population: 917237,
    geonameId: 3388368
  },
  "Seongnam-si": {
    coords: [127.13778, 37.43861],
    country: "KR",
    population: 914832,
    geonameId: 1897000
  },
  "Cartagena": {
    coords: [-75.49328, 10.39817],
    country: "CO",
    population: 914552,
    geonameId: 3687238
  },
  "Antipolo": {
    coords: [121.12251, 14.62578],
    country: "PH",
    population: 913712,
    geonameId: 1730501
  },
  "Columbus": {
    coords: [-82.99879, 39.96118],
    country: "US",
    population: 913175,
    geonameId: 4509177
  },
  "Sialkot": {
    coords: [74.53134, 32.49268],
    country: "PK",
    population: 911817,
    geonameId: 1164909
  },
  "Charlotte": {
    coords: [-80.84313, 35.22709],
    country: "US",
    population: 911311,
    geonameId: 4460243
  },
  "Laibin": {
    coords: [109.22222, 23.74743],
    country: "CN",
    population: 910282,
    geonameId: 1804609
  },
  "Warri": {
    coords: [5.75006, 5.51737],
    country: "NG",
    population: 910000,
    geonameId: 2319133
  },
  "Naples": {
    coords: [14.26811, 40.85216],
    country: "IT",
    population: 909048,
    geonameId: 3172394
  },
  "Padang": {
    coords: [100.35427, -0.94924],
    country: "ID",
    population: 909040,
    geonameId: 1633419
  },
  "Xiaogan": {
    coords: [113.92221, 30.92689],
    country: "CN",
    population: 908266,
    geonameId: 1790254
  },
  "Campo Grande": {
    coords: [-54.64639, -20.44278],
    country: "BR",
    population: 906092,
    geonameId: 3467747
  },
  "Ziyang": {
    coords: [104.64811, 30.12108],
    country: "CN",
    population: 905729,
    geonameId: 1783683
  },
  "Bobo-dioulasso": {
    coords: [-4.2979, 11.17715],
    country: "BF",
    population: 904920,
    geonameId: 2362344
  },
  "Bahawalpur": {
    coords: [71.6752, 29.39779],
    country: "PK",
    population: 903795,
    geonameId: 1183880
  },
  "Quzhou": {
    coords: [118.86861, 28.95944],
    country: "CN",
    population: 902767,
    geonameId: 1797264
  },
  "Blantyre": {
    coords: [35.00854, -15.78499],
    country: "MW",
    population: 902588,
    geonameId: 931755
  },
  "Donetsk": {
    coords: [37.80224, 48.023],
    country: "UA",
    population: 901645,
    geonameId: 709717
  },
  "Abu Ghurayb": {
    coords: [44.18477, 33.30563],
    country: "IQ",
    population: 900000,
    geonameId: 100077
  },
  "Qom": {
    coords: [50.8764, 34.6401],
    country: "IR",
    population: 900000,
    geonameId: 119208
  },
  "Bishkek": {
    coords: [74.59, 42.87],
    country: "KG",
    population: 900000,
    geonameId: 1528675
  },
  "Zaozhuang": {
    coords: [117.55417, 34.86472],
    country: "CN",
    population: 899753,
    geonameId: 1785453
  },
  "Krasnodar": {
    coords: [38.98178, 45.04534],
    country: "RU",
    population: 899541,
    geonameId: 542420
  },
  "Natal": {
    coords: [-35.20944, -5.795],
    country: "BR",
    population: 896708,
    geonameId: 3394023
  },
  "Pingxiang": {
    coords: [113.85353, 27.61672],
    country: "CN",
    population: 893550,
    geonameId: 1798654
  },
  "Indianapolis": {
    coords: [-86.15804, 39.76838],
    country: "US",
    population: 887642,
    geonameId: 4259418
  },
  "Gurugram": {
    coords: [77.02635, 28.4601],
    country: "IN",
    population: 886519,
    geonameId: 1270642
  },
  "Bhubaneswar": {
    coords: [85.83385, 20.27241],
    country: "IN",
    population: 885363,
    geonameId: 1275817
  },
  "Zhoushan": {
    coords: [122.20488, 29.98869],
    country: "CN",
    population: 882932,
    geonameId: 1886762
  },
  "Qiqihar": {
    coords: [123.96154, 47.33922],
    country: "CN",
    population: 882364,
    geonameId: 2035265
  },
  "Klang": {
    coords: [101.44333, 3.03667],
    country: "MY",
    population: 879867,
    geonameId: 1732905
  },
  "As Sulaymaniyah": {
    coords: [45.4329, 35.56496],
    country: "IQ",
    population: 878146,
    geonameId: 98463
  },
  "Puning": {
    coords: [116.16869, 23.31072],
    country: "CN",
    population: 874954,
    geonameId: 1802940
  },
  "Pikine": {
    coords: [-17.39071, 14.76457],
    country: "SN",
    population: 874062,
    geonameId: 2246678
  },
  "Bhiwandi": {
    coords: [73.05881, 19.30023],
    country: "IN",
    population: 874032,
    geonameId: 1275901
  },
  "Soshanguve": {
    coords: [28.09919, -25.47288],
    country: "ZA",
    population: 872309,
    geonameId: 954013
  },
  "Teresina": {
    coords: [-42.80194, -5.08917],
    country: "BR",
    population: 871126,
    geonameId: 3386496
  },
  "Marseille": {
    coords: [5.38107, 43.29695],
    country: "FR",
    population: 870731,
    geonameId: 2995469
  },
  "Ankang": {
    coords: [109.01722, 32.68],
    country: "CN",
    population: 870126,
    geonameId: 1789065
  },
  "Jalandhar": {
    coords: [75.57917, 31.32556],
    country: "IN",
    population: 868929,
    geonameId: 1268782
  },
  "Langfang": {
    coords: [116.71471, 39.52079],
    country: "CN",
    population: 868066,
    geonameId: 1804540
  },
  "Jiaozuo": {
    coords: [113.23914, 35.23925],
    country: "CN",
    population: 865413,
    geonameId: 1805987
  },
  "Rohini": {
    coords: [77.06778, 28.74322],
    country: "IN",
    population: 860000,
    geonameId: 12069922
  },
  "Wanxian": {
    coords: [108.37407, 30.81601],
    country: "CN",
    population: 859662,
    geonameId: 1791748
  },
  "Guang'an": {
    coords: [106.63696, 30.47413],
    country: "CN",
    population: 858159,
    geonameId: 1799194
  },
  "Johor Bahru": {
    coords: [103.7578, 1.4655],
    country: "MY",
    population: 858118,
    geonameId: 1732752
  },
  "Cheongju-si": {
    coords: [127.48972, 36.63722],
    country: "KR",
    population: 853938,
    geonameId: 1845604
  },
  "Pasig City": {
    coords: [121.0614, 14.58691],
    country: "PH",
    population: 853050,
    geonameId: 7290466
  },
  "Kanayannur": {
    coords: [76.26667, 9.96667],
    country: "IN",
    population: 851406,
    geonameId: 12501153
  },
  "Tegucigalpa": {
    coords: [-87.20681, 14.0818],
    country: "HN",
    population: 850848,
    geonameId: 3600949
  },
  "Bucheon-si": {
    coords: [126.78306, 37.49889],
    country: "KR",
    population: 850731,
    geonameId: 1838716
  },
  "Thanh Hoa": {
    coords: [105.76667, 19.8],
    country: "VN",
    population: 850000,
    geonameId: 1566166
  },
  "Turin": {
    coords: [7.68682, 45.07049],
    country: "IT",
    population: 847287,
    geonameId: 3165524
  },
  "Malang": {
    coords: [112.6304, -7.9797],
    country: "ID",
    population: 847182,
    geonameId: 1636722
  },
  "Al Ain City": {
    coords: [55.76056, 24.19167],
    country: "AE",
    population: 846747,
    geonameId: 292913
  },
  "Libreville": {
    coords: [9.45356, 0.39241],
    country: "GA",
    population: 846090,
    geonameId: 2399697
  },
  "Saratov": {
    coords: [45.9901, 51.54048],
    country: "RU",
    population: 844858,
    geonameId: 498677
  },
  "Ulan Bator": {
    coords: [106.88324, 47.90771],
    country: "MN",
    population: 844818,
    geonameId: 2028462
  },
  "Weihai": {
    coords: [122.11356, 37.50914],
    country: "CN",
    population: 844310,
    geonameId: 1791673
  },
  "Takeo": {
    coords: [104.78498, 10.99081],
    country: "KH",
    population: 843931,
    geonameId: 1821940
  },
  "Cochabamba": {
    coords: [-66.15995, -17.38195],
    country: "BO",
    population: 841276,
    geonameId: 3919968
  },
  "Ahvaz": {
    coords: [48.6842, 31.31901],
    country: "IR",
    population: 841145,
    geonameId: 144448
  },
  "Zhabei": {
    coords: [121.45972, 31.25861],
    country: "CN",
    population: 840000,
    geonameId: 1785412
  },
  "Xinyu": {
    coords: [114.93335, 27.80429],
    country: "CN",
    population: 839488,
    geonameId: 1788508
  },
  "Pietermaritzburg": {
    coords: [30.39278, -29.61679],
    country: "ZA",
    population: 839327,
    geonameId: 965301
  },
  "Yibin": {
    coords: [104.63994, 28.7593],
    country: "CN",
    population: 836340,
    geonameId: 1786770
  },
  "Naucalpan De Juarez": {
    coords: [-99.23963, 19.47851],
    country: "MX",
    population: 834434,
    geonameId: 3522790
  },
  "Kampung Baru Subang": {
    coords: [101.53333, 3.15],
    country: "MY",
    population: 833571,
    geonameId: 1771023
  },
  "Bouake": {
    coords: [-5.03031, 7.69385],
    country: "CI",
    population: 832371,
    geonameId: 2290956
  },
  "Samarinda": {
    coords: [117.14583, -0.49167],
    country: "ID",
    population: 831460,
    geonameId: 1629001
  },
  "Taicang": {
    coords: [121.09389, 31.44778],
    country: "CN",
    population: 831113,
    geonameId: 1793703
  },
  "San Francisco": {
    coords: [-122.41942, 37.77493],
    country: "US",
    population: 827526,
    geonameId: 5391959
  },
  "Sakai": {
    coords: [135.46653, 34.58216],
    country: "JP",
    population: 826161,
    geonameId: 1853195
  },
  "Nova Iguacu": {
    coords: [-43.45111, -22.75917],
    country: "BR",
    population: 823302,
    geonameId: 3456160
  },
  "Chenzhou": {
    coords: [113.03333, 25.8],
    country: "CN",
    population: 822534,
    geonameId: 1815059
  },
  "Duque De Caxias": {
    coords: [-43.31167, -22.78556],
    country: "BR",
    population: 818329,
    geonameId: 3464374
  },
  "Joao Pessoa": {
    coords: [-34.86306, -7.115],
    country: "BR",
    population: 817511,
    geonameId: 3397277
  },
  "Bukavu": {
    coords: [28.84281, -2.49077],
    country: "CD",
    population: 816811,
    geonameId: 217831
  },
  "Bangui": {
    coords: [18.55496, 4.36122],
    country: "CF",
    population: 812407,
    geonameId: 2389853
  },
  "Hermosillo": {
    coords: [-110.96677, 29.08874],
    country: "MX",
    population: 812229,
    geonameId: 4004898
  },
  "Bhayandar": {
    coords: [72.85107, 19.30157],
    country: "IN",
    population: 809378,
    geonameId: 1276014
  },
  "Culiacan": {
    coords: [-107.39421, 24.80209],
    country: "MX",
    population: 808416,
    geonameId: 4012176
  },
  "Petaling Jaya": {
    coords: [101.60671, 3.10726],
    country: "MY",
    population: 807879,
    geonameId: 1735158
  },
  "Malatya": {
    coords: [38.31667, 38.35018],
    country: "TR",
    population: 806156,
    geonameId: 304922
  },
  "Anqing": {
    coords: [117.04723, 30.51365],
    country: "CN",
    population: 804493,
    geonameId: 1817993
  },
  "Oran": {
    coords: [-0.63588, 35.69906],
    country: "DZ",
    population: 803329,
    geonameId: 2485926
  },
  "Freetown": {
    coords: [-13.2356, 8.48714],
    country: "SL",
    population: 802639,
    geonameId: 2409306
  },
  "San Pedro Sula": {
    coords: [-88.02588, 15.50585],
    country: "HN",
    population: 801259,
    geonameId: 3601782
  },
  "Narela": {
    coords: [77.09288, 28.85267],
    country: "IN",
    population: 800000,
    geonameId: 1261809
  },
  "Xingtai": {
    coords: [114.49272, 37.06217],
    country: "CN",
    population: 798770,
    geonameId: 1788927
  },
  "Niigata": {
    coords: [139.04125, 37.92259],
    country: "JP",
    population: 797591,
    geonameId: 1855431
  },
  "Muscat": {
    coords: [58.40778, 23.58413],
    country: "OM",
    population: 797000,
    geonameId: 287286
  },
  "Zarqa": {
    coords: [36.08796, 32.07275],
    country: "JO",
    population: 792665,
    geonameId: 250090
  },
  "Cankaya": {
    coords: [32.86268, 39.9179],
    country: "TR",
    population: 792189,
    geonameId: 6955677
  },
  "Hamamatsu": {
    coords: [137.73333, 34.7],
    country: "JP",
    population: 791707,
    geonameId: 1863289
  },
  "Kolwezi": {
    coords: [25.46674, -10.71484],
    country: "CD",
    population: 790248,
    geonameId: 922773
  },
  "Vinh": {
    coords: [105.69232, 18.67337],
    country: "VN",
    population: 790000,
    geonameId: 1562798
  },
  "Eskisehir": {
    coords: [30.52056, 39.77667],
    country: "TR",
    population: 789023,
    geonameId: 315202
  },
  "Thiruvananthapuram": {
    coords: [76.94924, 8.4855],
    country: "IN",
    population: 788271,
    geonameId: 1254163
  },
  "Pasragad Branch": {
    coords: [48.47168, 34.77772],
    country: "IR",
    population: 787878,
    geonameId: 10630176
  },
  "Zhaotong": {
    coords: [103.71667, 27.31667],
    country: "CN",
    population: 787845,
    geonameId: 1784841
  },
  "Panzhihua": {
    coords: [101.71276, 26.58509],
    country: "CN",
    population: 787177,
    geonameId: 6929460
  },
  "Chuzhou": {
    coords: [118.29778, 32.32194],
    country: "CN",
    population: 782671,
    geonameId: 1814757
  },
  "Seattle": {
    coords: [-122.33207, 47.60621],
    country: "US",
    population: 780995,
    geonameId: 5809844
  },
  "Port Said": {
    coords: [32.3019, 31.26531],
    country: "EG",
    population: 780515,
    geonameId: 358619
  },
  "Cucuta": {
    coords: [-72.5049, 7.90745],
    country: "CO",
    population: 777106,
    geonameId: 3685533
  },
  "Homs": {
    coords: [36.72559, 34.72405],
    country: "SY",
    population: 775404,
    geonameId: 169577
  },
  "Xuancheng": {
    coords: [118.75528, 30.9525],
    country: "CN",
    population: 774332,
    geonameId: 1788081
  },
  "Ibb": {
    coords: [44.18333, 13.96667],
    country: "YE",
    population: 771514,
    geonameId: 74477
  },
  "Nampula": {
    coords: [39.2666, -15.11646],
    country: "MZ",
    population: 770379,
    geonameId: 1033356
  },
  "Shangyu": {
    coords: [120.87111, 30.01556],
    country: "CN",
    population: 770000,
    geonameId: 1817720
  },
  "Bujumbura": {
    coords: [29.36142, -3.38193],
    country: "BI",
    population: 769317,
    geonameId: 425378
  },
  "Lodz": {
    coords: [19.47395, 51.77058],
    country: "PL",
    population: 768755,
    geonameId: 3093133
  },
  "Tyumen": {
    coords: [65.52722, 57.15222],
    country: "RU",
    population: 768358,
    geonameId: 1488754
  },
  "Erzurum": {
    coords: [41.27694, 39.90861],
    country: "TR",
    population: 767848,
    geonameId: 315368
  },
  "Anshun": {
    coords: [105.93333, 26.25],
    country: "CN",
    population: 765313,
    geonameId: 1817968
  },
  "Dodoma": {
    coords: [35.73947, -6.17221],
    country: "TZ",
    population: 765179,
    geonameId: 160196
  },
  "Rajshahi": {
    coords: [88.60114, 24.374],
    country: "BD",
    population: 763580,
    geonameId: 1185128
  },
  "Dera Ismail Khan": {
    coords: [70.9017, 31.83129],
    country: "PK",
    population: 763195,
    geonameId: 1180281
  },
  "Wuzhou": {
    coords: [111.28848, 23.48054],
    country: "CN",
    population: 761948,
    geonameId: 1790840
  },
  "Ipoh": {
    coords: [101.0829, 4.5841],
    country: "MY",
    population: 759952,
    geonameId: 1734634
  },
  "Qinhuangdao": {
    coords: [119.58936, 39.94104],
    country: "CN",
    population: 759718,
    geonameId: 1797595
  },
  "Benghazi": {
    coords: [20.06859, 32.11486],
    country: "LY",
    population: 757490,
    geonameId: 88319
  },
  "Krakow": {
    coords: [19.93658, 50.06143],
    country: "PL",
    population: 755050,
    geonameId: 3094802
  },
  "Aligarh": {
    coords: [78.07464, 27.88145],
    country: "IN",
    population: 753207,
    geonameId: 1279017
  },
  "Shaoyang": {
    coords: [111.46214, 27.23818],
    country: "CN",
    population: 753194,
    geonameId: 1816920
  },
  "Winnipeg": {
    coords: [-97.14704, 49.8844],
    country: "CA",
    population: 749607,
    geonameId: 6183235
  },
  "Bagcilar": {
    coords: [28.85671, 41.03903],
    country: "TR",
    population: 749024,
    geonameId: 751324
  },
  "Ota": {
    coords: [139.71605, 35.56126],
    country: "JP",
    population: 748081,
    geonameId: 8469289
  },
  "Andijon": {
    coords: [72.35067, 40.78338],
    country: "UZ",
    population: 747800,
    geonameId: 1514588
  },
  "Bareilly": {
    coords: [79.43167, 28.36678],
    country: "IN",
    population: 745435,
    geonameId: 1277013
  },
  "Buraydah": {
    coords: [43.97497, 26.32599],
    country: "SA",
    population: 745353,
    geonameId: 107304
  },
  "Sao Bernardo Do Campo": {
    coords: [-46.565, -23.69389],
    country: "BR",
    population: 743372,
    geonameId: 3449344
  },
  "Hegang": {
    coords: [130.29033, 47.34727],
    country: "CN",
    population: 743307,
    geonameId: 2036986
  },
  "Morelia": {
    coords: [-101.18443, 19.70078],
    country: "MX",
    population: 743275,
    geonameId: 3995402
  },
  "Riga": {
    coords: [24.10589, 56.946],
    country: "LV",
    population: 742572,
    geonameId: 456172
  },
  "Tasikmalaya": {
    coords: [108.2207, -7.3274],
    country: "ID",
    population: 741760,
    geonameId: 1624647
  },
  "Amsterdam": {
    coords: [4.88969, 52.37403],
    country: "NL",
    population: 741636,
    geonameId: 2759794
  },
  "Cagayan De Oro": {
    coords: [124.64722, 8.48222],
    country: "PH",
    population: 741617,
    geonameId: 1721080
  },
  "Ma'anshan": {
    coords: [118.51008, 31.68579],
    country: "CN",
    population: 741531,
    geonameId: 1801620
  },
  "Shah Alam": {
    coords: [101.53281, 3.08507],
    country: "MY",
    population: 740750,
    geonameId: 1732903
  },
  "Shizuishan": {
    coords: [106.3892, 38.98082],
    country: "CN",
    population: 739400,
    geonameId: 12324556
  },
  "Kumamoto": {
    coords: [130.69181, 32.80589],
    country: "JP",
    population: 738907,
    geonameId: 1858421
  },
  "Oyo": {
    coords: [3.93235, 7.85367],
    country: "NG",
    population: 736072,
    geonameId: 2325200
  },
  "Torreon": {
    coords: [-103.41898, 25.54389],
    country: "MX",
    population: 735340,
    geonameId: 3981254
  },
  "Deyang": {
    coords: [104.38198, 31.13019],
    country: "CN",
    population: 735070,
    geonameId: 1812961
  },
  "Abeokuta": {
    coords: [3.34509, 7.15571],
    country: "NG",
    population: 735000,
    geonameId: 2352947
  },
  "Al Hudaydah": {
    coords: [42.95452, 14.79781],
    country: "YE",
    population: 734699,
    geonameId: 79415
  },
  "Yangquan": {
    coords: [113.56333, 37.8575],
    country: "CN",
    population: 731228,
    geonameId: 1787351
  },
  "Akure": {
    coords: [5.19312, 7.25256],
    country: "NG",
    population: 730000,
    geonameId: 2350841
  },
  "Sao Jose Dos Campos": {
    coords: [-45.88694, -23.17944],
    country: "BR",
    population: 729737,
    geonameId: 3448636
  },
  "Denver": {
    coords: [-104.9847, 39.73915],
    country: "US",
    population: 729019,
    geonameId: 5419384
  },
  "Osasco": {
    coords: [-46.79167, -23.5325],
    country: "BR",
    population: 728615,
    geonameId: 3455775
  },
  "Ashgabat": {
    coords: [58.38333, 37.95],
    country: "TM",
    population: 727700,
    geonameId: 162183
  },
  "Alvaro Obregon": {
    coords: [-99.20329, 19.35867],
    country: "MX",
    population: 726664,
    geonameId: 3514663
  },
  "Aihara": {
    coords: [139.31667, 35.6],
    country: "JP",
    population: 725493,
    geonameId: 1865689
  },
  "Evaton": {
    coords: [27.85, -26.53333],
    country: "ZA",
    population: 725468,
    geonameId: 1004866
  },
  "Denpasar": {
    coords: [115.21667, -8.65],
    country: "ID",
    population: 725314,
    geonameId: 1645528
  },
  "Valenzuela": {
    coords: [120.9667, 14.7],
    country: "PH",
    population: 725173,
    geonameId: 1680102
  },
  "Muzaffarabad": {
    coords: [73.47082, 34.37002],
    country: "PK",
    population: 725000,
    geonameId: 1169607
  },
  "Okayama": {
    coords: [133.93333, 34.65],
    country: "JP",
    population: 724691,
    geonameId: 1854383
  },
  "San Luis Potosi": {
    coords: [-100.97135, 22.15234],
    country: "MX",
    population: 722772,
    geonameId: 3985606
  },
  "Aguascalientes": {
    coords: [-102.2843, 21.88262],
    country: "MX",
    population: 722250,
    geonameId: 4019233
  },
  "Zhumadian": {
    coords: [114.02944, 32.97944],
    country: "CN",
    population: 721670,
    geonameId: 1783873
  },
  "Moradabad": {
    coords: [78.77684, 28.83893],
    country: "IN",
    population: 721139,
    geonameId: 1262801
  },
  "Sagamihara": {
    coords: [139.24167, 35.56707],
    country: "JP",
    population: 720780,
    geonameId: 11611609
  },
  "Mississauga": {
    coords: [-79.6583, 43.5789],
    country: "CA",
    population: 717961,
    geonameId: 6075357
  },
  "Lviv": {
    coords: [24.02324, 49.83826],
    country: "UA",
    population: 717273,
    geonameId: 702550
  },
  "Namangan": {
    coords: [71.67257, 40.9983],
    country: "UZ",
    population: 713220,
    geonameId: 1513157
  },
  "Ribeirao Preto": {
    coords: [-47.81028, -21.1775],
    country: "BR",
    population: 711825,
    geonameId: 3451328
  },
  "Zaporizhzhya": {
    coords: [35.11714, 47.85167],
    country: "UA",
    population: 710052,
    geonameId: 687700
  },
  "Zanzibar": {
    coords: [39.19793, -6.16394],
    country: "TZ",
    population: 709809,
    geonameId: 148730
  },
  "Saltillo": {
    coords: [-100.97963, 25.42595],
    country: "MX",
    population: 709671,
    geonameId: 3988086
  },
  "Latakia": {
    coords: [35.79088, 35.53125],
    country: "SY",
    population: 709000,
    geonameId: 173576
  },
  "Subang Jaya": {
    coords: [101.58062, 3.04384],
    country: "MY",
    population: 708296,
    geonameId: 8504423
  },
  "Warangal": {
    coords: [79.58333, 18],
    country: "IN",
    population: 704570,
    geonameId: 1252948
  },
  "Paranaque City": {
    coords: [121.01749, 14.48156],
    country: "PH",
    population: 703245,
    geonameId: 1694781
  },
  "Tolyatti": {
    coords: [49.3461, 53.5303],
    country: "RU",
    population: 702879,
    geonameId: 482283
  },
  "Jaboatao": {
    coords: [-35.00139, -8.18028],
    country: "BR",
    population: 702621,
    geonameId: 3397838
  },
  "Santo Domingo Oeste": {
    coords: [-70, 18.5],
    country: "DO",
    population: 701269,
    geonameId: 7874116
  },
  "Santo Domingo Este": {
    coords: [-69.84757, 18.48511],
    country: "DO",
    population: 700000,
    geonameId: 8601412
  },
  "Battagram": {
    coords: [73.02329, 34.67719],
    country: "PK",
    population: 700000,
    geonameId: 1183105
  },
  "Suez": {
    coords: [32.52627, 29.97371],
    country: "EG",
    population: 699541,
    geonameId: 359796
  },
  "Agadir": {
    coords: [-9.59815, 30.42018],
    country: "MA",
    population: 698310,
    geonameId: 2561668
  },
  "Edogawe": {
    coords: [139.87308, 35.69225],
    country: "JP",
    population: 697932,
    geonameId: 11071717
  },
  "General Santos": {
    coords: [125.17167, 6.11278],
    country: "PH",
    population: 697315,
    geonameId: 1713022
  },
  "Sarajevo": {
    coords: [18.35644, 43.84864],
    country: "BA",
    population: 696731,
    geonameId: 3191281
  },
  "Balikpapan": {
    coords: [116.82887, -1.26753],
    country: "ID",
    population: 695287,
    geonameId: 1650527
  },
  "Adachi": {
    coords: [139.80761, 35.76318],
    country: "JP",
    population: 695043,
    geonameId: 10987897
  },
  "Bauchi": {
    coords: [9.84388, 10.31032],
    country: "NG",
    population: 693700,
    geonameId: 2347470
  },
  "Shizuoka": {
    coords: [138.38333, 34.98333],
    country: "JP",
    population: 693389,
    geonameId: 1851717
  },
  "Tunis": {
    coords: [10.16579, 36.81897],
    country: "TN",
    population: 693210,
    geonameId: 2464470
  },
  "Zhangjiakou": {
    coords: [114.87139, 40.78341],
    country: "CN",
    population: 692602,
    geonameId: 2033196
  },
  "Serang": {
    coords: [106.15417, -6.11528],
    country: "ID",
    population: 692101,
    geonameId: 1627549
  },
  "Washington": {
    coords: [-77.03637, 38.89511],
    country: "US",
    population: 689545,
    geonameId: 4140963
  },
  "Nashville": {
    coords: [-86.78444, 36.16589],
    country: "US",
    population: 689447,
    geonameId: 4644585
  },
  "Fuxin": {
    coords: [121.65889, 42.01556],
    country: "CN",
    population: 689050,
    geonameId: 2037346
  },
  "Ta'if": {
    coords: [40.41583, 21.27028],
    country: "SA",
    population: 688693,
    geonameId: 107968
  },
  "Huangshi": {
    coords: [115.04814, 30.24706],
    country: "CN",
    population: 688090,
    geonameId: 1807234
  },
  "Liaoyang": {
    coords: [123.17306, 41.27194],
    country: "CN",
    population: 687890,
    geonameId: 2036113
  },
  "Beira": {
    coords: [34.83889, -19.84361],
    country: "MZ",
    population: 687764,
    geonameId: 1052373
  },
  "Sevilla": {
    coords: [-5.97317, 37.38283],
    country: "ES",
    population: 687488,
    geonameId: 2510911
  },
  "Sorocaba": {
    coords: [-47.45806, -23.50167],
    country: "BR",
    population: 687357,
    geonameId: 3447399
  },
  "Zaragoza": {
    coords: [-0.87734, 41.65606],
    country: "ES",
    population: 686986,
    geonameId: 3104324
  },
  "Baise": {
    coords: [106.62684, 23.89013],
    country: "CN",
    population: 686078,
    geonameId: 1816269
  },
  "Situbondo": {
    coords: [114.00976, -7.70623],
    country: "ID",
    population: 685967,
    geonameId: 1626801
  },
  "Binzhou": {
    coords: [118.01667, 37.36667],
    country: "CN",
    population: 682717,
    geonameId: 1816336
  },
  "Oklahoma City": {
    coords: [-97.51643, 35.46756],
    country: "US",
    population: 681054,
    geonameId: 4544349
  },
  "Yuncheng": {
    coords: [110.99278, 35.02306],
    country: "CN",
    population: 680036,
    geonameId: 1785738
  },
  "Dezhou": {
    coords: [116.36706, 37.44661],
    country: "CN",
    population: 679535,
    geonameId: 1812955
  },
  "Dushanbe": {
    coords: [68.77905, 38.53575],
    country: "TJ",
    population: 679400,
    geonameId: 1221874
  },
  "Cotonou": {
    coords: [2.41833, 6.36536],
    country: "BJ",
    population: 679012,
    geonameId: 2394819
  },
  "El Paso": {
    coords: [-106.48693, 31.75872],
    country: "US",
    population: 678815,
    geonameId: 5520993
  },
  "Guadalupe": {
    coords: [-100.25646, 25.67678],
    country: "MX",
    population: 673616,
    geonameId: 4005492
  },
  "Acapulco De Juarez": {
    coords: [-99.90891, 16.84942],
    country: "MX",
    population: 673479,
    geonameId: 3533462
  },
  "Guntur": {
    coords: [80.45729, 16.29974],
    country: "IN",
    population: 670073,
    geonameId: 1270668
  },
  "Katsina": {
    coords: [7.60177, 12.99082],
    country: "NG",
    population: 670000,
    geonameId: 2334802
  },
  "Sanmenxia": {
    coords: [111.19287, 34.78081],
    country: "CN",
    population: 669307,
    geonameId: 1796669
  },
  "E'zhou": {
    coords: [114.88655, 30.39607],
    country: "CN",
    population: 668727,
    geonameId: 6642286
  },
  "Madinat An Nasr": {
    coords: [31.3, 30.06667],
    country: "EG",
    population: 668413,
    geonameId: 353225
  },
  "Tabuk": {
    coords: [36.57151, 28.3998],
    country: "SA",
    population: 667000,
    geonameId: 101628
  },
  "Kitwe": {
    coords: [28.21323, -12.80243],
    country: "ZM",
    population: 665961,
    geonameId: 911148
  },
  "Bulawayo": {
    coords: [28.58333, -20.15],
    country: "ZW",
    population: 665952,
    geonameId: 894701
  },
  "Mudanjiang": {
    coords: [129.62594, 44.54804],
    country: "CN",
    population: 665915,
    geonameId: 2035715
  },
  "Aracaju": {
    coords: [-37.07167, -10.91111],
    country: "BR",
    population: 664908,
    geonameId: 3471872
  },
  "Athens": {
    coords: [23.72784, 37.98376],
    country: "GR",
    population: 664046,
    geonameId: 264371
  },
  "Zagreb": {
    coords: [15.97798, 45.81444],
    country: "HR",
    population: 663592,
    geonameId: 3186886
  },
  "Leshan": {
    coords: [103.76386, 29.56227],
    country: "CN",
    population: 662814,
    geonameId: 1804153
  },
  "Santo Andre": {
    coords: [-46.53833, -23.66389],
    country: "BR",
    population: 662373,
    geonameId: 3449701
  },
  "Vancouver": {
    coords: [-123.11934, 49.24966],
    country: "CA",
    population: 662248,
    geonameId: 6173331
  },
  "Rizhao": {
    coords: [119.52908, 35.41414],
    country: "CN",
    population: 661943,
    geonameId: 9072919
  },
  "Helsinki": {
    coords: [24.93545, 60.16952],
    country: "FI",
    population: 658864,
    geonameId: 658225
  },
  "Cheonan": {
    coords: [127.1522, 36.8065],
    country: "KR",
    population: 658831,
    geonameId: 1845759
  },
  "Pontianak": {
    coords: [109.325, -0.03194],
    country: "ID",
    population: 658685,
    geonameId: 1630789
  },
  "Banjarmasin": {
    coords: [114.59075, -3.31987],
    country: "ID",
    population: 657663,
    geonameId: 1650213
  },
  "Puducherry": {
    coords: [79.82979, 11.93381],
    country: "IN",
    population: 657209,
    geonameId: 1259425
  },
  "Suining": {
    coords: [105.57332, 30.50802],
    country: "CN",
    population: 656760,
    geonameId: 1793900
  },
  "Brampton": {
    coords: [-79.76633, 43.68341],
    country: "CA",
    population: 656480,
    geonameId: 5907364
  },
  "Soacha": {
    coords: [-74.21682, 4.57937],
    country: "CO",
    population: 655025,
    geonameId: 3667905
  },
  "Boston": {
    coords: [-71.05977, 42.35843],
    country: "US",
    population: 653833,
    geonameId: 4930956
  },
  "Tlalnepantla": {
    coords: [-99.19538, 19.54005],
    country: "MX",
    population: 653410,
    geonameId: 3515431
  },
  "Portland": {
    coords: [-122.67621, 45.52345],
    country: "US",
    population: 652503,
    geonameId: 5746545
  },
  "Tlaquepaque": {
    coords: [-103.29342, 20.64121],
    country: "MX",
    population: 650123,
    geonameId: 3981461
  },
  "Frankfurt Am Main": {
    coords: [8.68417, 50.11552],
    country: "DE",
    population: 650000,
    geonameId: 2925533
  },
  "Macau": {
    coords: [113.54611, 22.20056],
    country: "MO",
    population: 649335,
    geonameId: 1821274
  },
  "Palermo": {
    coords: [13.3636, 38.1166],
    country: "IT",
    population: 648260,
    geonameId: 2523920
  },
  "Izhevsk": {
    coords: [53.19862, 56.85225],
    country: "RU",
    population: 648213,
    geonameId: 554840
  },
  "Colombo": {
    coords: [79.84868, 6.93548],
    country: "LK",
    population: 648034,
    geonameId: 1248991
  },
  "Maturin": {
    coords: [-63.18323, 9.74569],
    country: "VE",
    population: 647459,
    geonameId: 3778045
  },
  "Amravati": {
    coords: [77.75, 20.93333],
    country: "IN",
    population: 647057,
    geonameId: 1278718
  },
  "Detroit": {
    coords: [-83.04575, 42.33143],
    country: "US",
    population: 645705,
    geonameId: 4990729
  },
  "Osogbo": {
    coords: [4.55698, 7.77104],
    country: "NG",
    population: 645000,
    geonameId: 2325590
  },
  "Honcho": {
    coords: [139.98648, 35.70129],
    country: "JP",
    population: 644668,
    geonameId: 1863905
  },
  "Bikaner": {
    coords: [73.31495, 28.01762],
    country: "IN",
    population: 644406,
    geonameId: 1275665
  },
  "Jaboatao Dos Guararapes": {
    coords: [-35.01472, -8.11278],
    country: "BR",
    population: 644037,
    geonameId: 6317344
  },
  "Las Vegas": {
    coords: [-115.13722, 36.17497],
    country: "US",
    population: 641903,
    geonameId: 5506956
  },
  "New South Memphis": {
    coords: [-90.05676, 35.08676],
    country: "US",
    population: 641608,
    geonameId: 4645421
  },
  "Hwaseong-si": {
    coords: [126.8169, 37.20682],
    country: "KR",
    population: 640890,
    geonameId: 1843847
  },
  "Gold Coast": {
    coords: [153.43088, -28.00029],
    country: "AU",
    population: 640778,
    geonameId: 2165087
  },
  "Al Ahmadi": {
    coords: [48.08389, 29.07694],
    country: "KW",
    population: 637411,
    geonameId: 285839
  },
  "Cuenca": {
    coords: [-78.9963, -2.8953],
    country: "EC",
    population: 636996,
    geonameId: 3658666
  },
  "Chisinau": {
    coords: [28.85938, 47.00902],
    country: "MD",
    population: 635994,
    geonameId: 618426
  },
  "Likasi": {
    coords: [26.7384, -10.98303],
    country: "CD",
    population: 635768,
    geonameId: 922741
  },
  "Wroclaw": {
    coords: [17.03006, 51.10286],
    country: "PL",
    population: 634893,
    geonameId: 3081368
  },
  "Hebi": {
    coords: [114.28616, 35.73231],
    country: "CN",
    population: 634721,
    geonameId: 1808770
  },
  "Tshikapa": {
    coords: [20.79995, -6.41621],
    country: "CD",
    population: 634529,
    geonameId: 204953
  },
  "Kochi": {
    coords: [76.26022, 9.93988],
    country: "IN",
    population: 633553,
    geonameId: 1273874
  },
  "Memphis": {
    coords: [-90.04898, 35.14953],
    country: "US",
    population: 633104,
    geonameId: 4641239
  },
  "Jingmen": {
    coords: [112.20472, 31.03361],
    country: "CN",
    population: 632954,
    geonameId: 1805611
  },
  "Barnaul": {
    coords: [83.72786, 53.36199],
    country: "RU",
    population: 632372,
    geonameId: 1510853
  },
  "Dandong": {
    coords: [124.39472, 40.12917],
    country: "CN",
    population: 631973,
    geonameId: 2037886
  },
  "Stuttgart": {
    coords: [9.17702, 48.78232],
    country: "DE",
    population: 630305,
    geonameId: 2825297
  },
  "Jeonju": {
    coords: [127.14889, 35.82194],
    country: "KR",
    population: 629618,
    geonameId: 1845457
  },
  "Cancun": {
    coords: [-86.84656, 21.17429],
    country: "MX",
    population: 628306,
    geonameId: 3531673
  },
  "Bhilai": {
    coords: [81.4285, 21.20919],
    country: "IN",
    population: 627734,
    geonameId: 1275971
  },
  "Ndola": {
    coords: [28.63659, -12.95867],
    country: "ZM",
    population: 627503,
    geonameId: 901344
  },
  "Contagem": {
    coords: [-44.05361, -19.93167],
    country: "BR",
    population: 627123,
    geonameId: 3465624
  },
  "Ulyanovsk": {
    coords: [48.38657, 54.32824],
    country: "RU",
    population: 626540,
    geonameId: 479123
  },
  "Djibouti": {
    coords: [43.14503, 11.58901],
    country: "DJ",
    population: 626512,
    geonameId: 223817
  },
  "Glasgow": {
    coords: [-4.25763, 55.86515],
    country: "GB",
    population: 626410,
    geonameId: 2648579
  },
  "Panshan": {
    coords: [122.04944, 41.18806],
    country: "CN",
    population: 625040,
    geonameId: 2035513
  },
  "Louisville": {
    coords: [-85.75941, 38.25424],
    country: "US",
    population: 624444,
    geonameId: 4299276
  },
  "Irkutsk": {
    coords: [104.29076, 52.29566],
    country: "RU",
    population: 623869,
    geonameId: 2023469
  },
  "Ansan-si": {
    coords: [126.82194, 37.32361],
    country: "KR",
    population: 623256,
    geonameId: 1846918
  },
  "Al Mansurah": {
    coords: [31.38069, 31.03637],
    country: "EG",
    population: 621953,
    geonameId: 360761
  },
  "Kermanshah": {
    coords: [47.065, 34.31417],
    country: "IR",
    population: 621100,
    geonameId: 128226
  },
  "Duesseldorf": {
    coords: [6.77616, 51.22172],
    country: "DE",
    population: 620523,
    geonameId: 2934246
  },
  "Coyoacan": {
    coords: [-99.16174, 19.3467],
    country: "MX",
    population: 620416,
    geonameId: 3530139
  },
  "Feira De Santana": {
    coords: [-38.96667, -12.26667],
    country: "BR",
    population: 619609,
    geonameId: 3463478
  },
  "Jiaozhou": {
    coords: [120.00333, 36.28389],
    country: "CN",
    population: 619266,
    geonameId: 1806096
  },
  "Suizhou": {
    coords: [113.36306, 31.71111],
    country: "CN",
    population: 618582,
    geonameId: 1793879
  },
  "Villa Nueva": {
    coords: [-90.58544, 14.52512],
    country: "GT",
    population: 618397,
    geonameId: 3587902
  },
  "Khabarovsk": {
    coords: [135.0971, 48.46204],
    country: "RU",
    population: 618150,
    geonameId: 2022890
  },
  "Cuiaba": {
    coords: [-56.09667, -15.59611],
    country: "BR",
    population: 618124,
    geonameId: 3465038
  },
  "Arusha": {
    coords: [36.68333, -3.36667],
    country: "TZ",
    population: 617631,
    geonameId: 161325
  },
  "Las Pinas": {
    coords: [120.98278, 14.45056],
    country: "PH",
    population: 615549,
    geonameId: 1707174
  },
  "Chizhou": {
    coords: [117.47783, 30.66134],
    country: "CN",
    population: 615274,
    geonameId: 1814934
  },
  "Santa Maria Chimalhuacan": {
    coords: [-98.95038, 19.42155],
    country: "MX",
    population: 612383,
    geonameId: 3517270
  },
  "Ya'an": {
    coords: [102.999, 29.98521],
    country: "CN",
    population: 612056,
    geonameId: 1787816
  },
  "Cuttack": {
    coords: [85.87927, 20.46497],
    country: "IN",
    population: 610189,
    geonameId: 1273780
  },
  "Borivli": {
    coords: [72.85976, 19.23496],
    country: "IN",
    population: 609617,
    geonameId: 1275248
  },
  "Yaroslavl": {
    coords: [39.87368, 57.62987],
    country: "RU",
    population: 608722,
    geonameId: 468902
  },
  "Goeteborg": {
    coords: [11.96679, 57.70716],
    country: "SE",
    population: 608462,
    geonameId: 2711537
  },
  "Kawaguchi": {
    coords: [139.71072, 35.80521],
    country: "JP",
    population: 607373,
    geonameId: 1859730
  },
  "Bukit Rahman Putra": {
    coords: [101.5608, 3.21727],
    country: "MY",
    population: 607000,
    geonameId: 13118225
  },
  "Jambi City": {
    coords: [103.61667, -1.6],
    country: "ID",
    population: 606200,
    geonameId: 1642858
  },
  "Ha'il": {
    coords: [41.69073, 27.52188],
    country: "SA",
    population: 605930,
    geonameId: 106281
  },
  "Bhavnagar": {
    coords: [72.15331, 21.76287],
    country: "IN",
    population: 605882,
    geonameId: 1276032
  },
  "Benoni": {
    coords: [28.32078, -26.18848],
    country: "ZA",
    population: 605344,
    geonameId: 1020098
  },
  "Vladivostok": {
    coords: [131.87353, 43.10562],
    country: "RU",
    population: 604901,
    geonameId: 2013348
  },
  "Jinzhou": {
    coords: [121.14167, 41.10778],
    country: "CN",
    population: 604269,
    geonameId: 2036427
  },
  "Tuxtla": {
    coords: [-93.11578, 16.75357],
    country: "MX",
    population: 604147,
    geonameId: 3515001
  },
  "Kryvyy Rih": {
    coords: [33.39404, 47.90572],
    country: "UA",
    population: 603904,
    geonameId: 703845
  },
  "Sanming": {
    coords: [117.61861, 26.24861],
    country: "CN",
    population: 602166,
    geonameId: 1796663
  },
  "Islamabad": {
    coords: [73.04329, 33.72148],
    country: "PK",
    population: 601600,
    geonameId: 1176615
  },
  "Sangli": {
    coords: [74.56417, 16.85438],
    country: "IN",
    population: 601214,
    geonameId: 1257416
  },
  "Jamnagar": {
    coords: [70.06673, 22.47292],
    country: "IN",
    population: 600943,
    geonameId: 1269317
  },
  "Lubango": {
    coords: [13.4925, -14.91717],
    country: "AO",
    population: 600751,
    geonameId: 3347762
  },
  "Shuangyashan": {
    coords: [131.13273, 46.67686],
    country: "CN",
    population: 600000,
    geonameId: 2034786
  },
  "Pokhara": {
    coords: [83.96851, 28.26689],
    country: "NP",
    population: 599504,
    geonameId: 1282898
  },
  "Rotterdam": {
    coords: [4.47917, 51.9225],
    country: "NL",
    population: 598199,
    geonameId: 2747891
  },
  "Borama": {
    coords: [43.18278, 9.93611],
    country: "SO",
    population: 597842,
    geonameId: 64021
  },
  "Pallabi": {
    coords: [90.37, 23.825],
    country: "BD",
    population: 597574,
    geonameId: 7696679
  },
  "Luancheng": {
    coords: [114.64629, 37.88452],
    country: "CN",
    population: 597130,
    geonameId: 1802204
  },
  "Makhachkala": {
    coords: [47.50027, 42.97782],
    country: "RU",
    population: 596356,
    geonameId: 532096
  },
  "Anyang-si": {
    coords: [126.92694, 37.3925],
    country: "KR",
    population: 595644,
    geonameId: 1846898
  },
  "Huambo": {
    coords: [15.73917, -12.77611],
    country: "AO",
    population: 595304,
    geonameId: 3348313
  },
  "Samarkand": {
    coords: [66.96445, 39.65456],
    country: "UZ",
    population: 595200,
    geonameId: 1216265
  },
  "Mengzi": {
    coords: [103.38212, 23.36779],
    country: "CN",
    population: 595100,
    geonameId: 13512502
  },
  "Kagoshima": {
    coords: [130.55, 31.56667],
    country: "JP",
    population: 595049,
    geonameId: 1860827
  },
  "Mukalla": {
    coords: [49.12424, 14.54248],
    country: "YE",
    population: 594951,
    geonameId: 78754
  },
  "Rasht": {
    coords: [49.58862, 37.27611],
    country: "IR",
    population: 594590,
    geonameId: 118743
  },
  "Mar Del Plata": {
    coords: [-57.5562, -38.00042],
    country: "AR",
    population: 593337,
    geonameId: 3430863
  },
  "Essen": {
    coords: [7.01228, 51.45657],
    country: "DE",
    population: 593085,
    geonameId: 2928810
  },
  "Al Mahallah Al Kubra": {
    coords: [31.1669, 30.97063],
    country: "EG",
    population: 592573,
    geonameId: 360829
  },
  "Malaga": {
    coords: [-4.42034, 36.72016],
    country: "ES",
    population: 591637,
    geonameId: 2514256
  },
  "Shekhupura": {
    coords: [73.98556, 31.71287],
    country: "PK",
    population: 591424,
    geonameId: 1165221
  },
  "Yingkou": {
    coords: [122.23176, 40.66472],
    country: "CN",
    population: 591159,
    geonameId: 2033370
  },
  "Cimahi": {
    coords: [107.5425, -6.87222],
    country: "ID",
    population: 590782,
    geonameId: 1646448
  },
  "Zhangzhou": {
    coords: [117.65556, 24.51333],
    country: "CN",
    population: 589831,
    geonameId: 1785018
  },
  "Reynosa": {
    coords: [-98.28456, 26.08005],
    country: "MX",
    population: 589466,
    geonameId: 3520339
  },
  "Thuan An": {
    coords: [106.71428, 10.9239],
    country: "VN",
    population: 588616,
    geonameId: 12382296
  },
  "Dortmund": {
    coords: [7.466, 51.51494],
    country: "DE",
    population: 588462,
    geonameId: 2935517
  },
  "Suginami": {
    coords: [140.28406, 36.2013],
    country: "JP",
    population: 588354,
    geonameId: 11836117
  },
  "Londrina": {
    coords: [-51.16278, -23.31028],
    country: "BR",
    population: 588125,
    geonameId: 3458449
  },
  "Baltimore": {
    coords: [-76.61219, 39.29038],
    country: "US",
    population: 585708,
    geonameId: 4347778
  },
  "Itabashi": {
    coords: [139.71497, 35.74893],
    country: "JP",
    population: 584483,
    geonameId: 1861321
  },
  "New Kingston": {
    coords: [-76.78319, 18.00747],
    country: "JM",
    population: 583958,
    geonameId: 3489297
  },
  "Pelentong": {
    coords: [103.824, 1.5243],
    country: "MY",
    population: 583640,
    geonameId: 1732747
  },
  "Bucaramanga": {
    coords: [-73.11895, 7.125],
    country: "CO",
    population: 581130,
    geonameId: 3688465
  },
  "Genoa": {
    coords: [8.94439, 44.40478],
    country: "IT",
    population: 580097,
    geonameId: 3176219
  },
  "Hachioji": {
    coords: [139.32389, 35.65583],
    country: "JP",
    population: 579355,
    geonameId: 1863440
  },
  "Malacca": {
    coords: [102.2405, 2.196],
    country: "MY",
    population: 579000,
    geonameId: 1734759
  },
  "Nha Trang": {
    coords: [109.19432, 12.24507],
    country: "VN",
    population: 579000,
    geonameId: 1572151
  },
  "Khabarovsk Vtoroy": {
    coords: [135.12994, 48.43787],
    country: "RU",
    population: 578303,
    geonameId: 2056752
  },
  "Kerman": {
    coords: [57.07879, 30.28321],
    country: "IR",
    population: 577514,
    geonameId: 128234
  },
  "Orumiyeh": {
    coords: [45.07605, 37.55274],
    country: "IR",
    population: 577307,
    geonameId: 121801
  },
  "Bahcelievler": {
    coords: [28.8598, 41.00231],
    country: "TR",
    population: 576799,
    geonameId: 7627067
  },
  "Tanta": {
    coords: [31.00192, 30.78847],
    country: "EG",
    population: 576648,
    geonameId: 347497
  },
  "Jammu": {
    coords: [74.86167, 32.73528],
    country: "IN",
    population: 576198,
    geonameId: 1269321
  },
  "Iskandar Puteri": {
    coords: [103.62322, 1.39324],
    country: "MY",
    population: 575977,
    geonameId: 10063567
  },
  "Calamba": {
    coords: [121.16528, 14.21167],
    country: "PH",
    population: 575046,
    geonameId: 1720681
  },
  "Tlalpan": {
    coords: [-99.16206, 19.29513],
    country: "MX",
    population: 574577,
    geonameId: 3515428
  },
  "Herat": {
    coords: [62.19967, 34.34817],
    country: "AF",
    population: 574300,
    geonameId: 1140026
  },
  "Gujrat": {
    coords: [74.07542, 32.5742],
    country: "PK",
    population: 574240,
    geonameId: 1177654
  },
  "Tomsk": {
    coords: [84.98216, 56.50049],
    country: "RU",
    population: 574002,
    geonameId: 1489425
  },
  "Juiz De Fora": {
    coords: [-43.35028, -21.76417],
    country: "BR",
    population: 573285,
    geonameId: 3459505
  },
  "Umraniye": {
    coords: [29.12476, 41.01643],
    country: "TR",
    population: 573265,
    geonameId: 738377
  },
  "Shihezi": {
    coords: [86.03694, 44.3023],
    country: "CN",
    population: 572772,
    geonameId: 1529195
  },
  "South Boston": {
    coords: [-71.04949, 42.33343],
    country: "US",
    population: 571281,
    geonameId: 4951305
  },
  "Nakuru": {
    coords: [36.07225, -0.30719],
    country: "KE",
    population: 570674,
    geonameId: 184622
  },
  "Poznan": {
    coords: [16.92993, 52.40692],
    country: "PL",
    population: 570352,
    geonameId: 3088171
  },
  "Hamilton": {
    coords: [-79.84963, 43.25011],
    country: "CA",
    population: 569353,
    geonameId: 5969782
  },
  "Irbid": {
    coords: [35.85, 32.55556],
    country: "JO",
    population: 569068,
    geonameId: 248946
  },
  "Manchester": {
    coords: [-2.23743, 53.48095],
    country: "GB",
    population: 568996,
    geonameId: 2643123
  },
  "Kota Bharu": {
    coords: [102.24333, 6.12361],
    country: "MY",
    population: 568900,
    geonameId: 1736376
  },
  "Surrey": {
    coords: [-122.82509, 49.10635],
    country: "CA",
    population: 568322,
    geonameId: 6159905
  },
  "Meknes": {
    coords: [-5.54727, 33.89352],
    country: "MA",
    population: 568295,
    geonameId: 2542715
  },
  "Puente Alto": {
    coords: [-70.57577, -33.61169],
    country: "CL",
    population: 568106,
    geonameId: 3875024
  },
  "Nyala": {
    coords: [24.88069, 12.04888],
    country: "SD",
    population: 565734,
    geonameId: 369004
  },
  "Orenburg": {
    coords: [55.09883, 51.76712],
    country: "RU",
    population: 564773,
    geonameId: 515003
  },
  "Albuquerque": {
    coords: [-106.65114, 35.08449],
    country: "US",
    population: 564559,
    geonameId: 5454711
  },
  "Bokaro": {
    coords: [86.15161, 23.66934],
    country: "IN",
    population: 564319,
    geonameId: 1275362
  },
  "Asmara": {
    coords: [38.93184, 15.33805],
    country: "ER",
    population: 563930,
    geonameId: 343300
  },
  "Sukkur": {
    coords: [68.85889, 27.70323],
    country: "PK",
    population: 563851,
    geonameId: 1164408
  },
  "Uberlandia": {
    coords: [-48.27722, -18.91861],
    country: "BR",
    population: 563536,
    geonameId: 3445831
  },
  "Milwaukee": {
    coords: [-87.90647, 43.0389],
    country: "US",
    population: 563531,
    geonameId: 5263045
  },
  "Cho Lon": {
    coords: [106.65, 10.75],
    country: "VN",
    population: 561000,
    geonameId: 1585330
  },
  "Wenchang": {
    coords: [110.80279, 19.55158],
    country: "CN",
    population: 560894,
    geonameId: 1791544
  },
  "Ile-ife": {
    coords: [4.56032, 7.4824],
    country: "NG",
    population: 560000,
    geonameId: 2338900
  },
  "Gombe": {
    coords: [11.16729, 10.28969],
    country: "NG",
    population: 560000,
    geonameId: 2340451
  },
  "Hamhung": {
    coords: [127.53639, 39.91833],
    country: "KP",
    population: 559056,
    geonameId: 1877449
  },
  "Kemerovo": {
    coords: [86.10435, 55.35417],
    country: "RU",
    population: 558973,
    geonameId: 1503901
  },
  "Nasiriyah": {
    coords: [46.25726, 31.05799],
    country: "IQ",
    population: 558400,
    geonameId: 98854
  },
  "Bloemfontein": {
    coords: [26.214, -29.12107],
    country: "ZA",
    population: 556637,
    geonameId: 1018725
  },
  "Sheffield": {
    coords: [-1.4659, 53.38297],
    country: "GB",
    population: 556500,
    geonameId: 2638077
  },
  "Dresden": {
    coords: [13.73832, 51.05089],
    country: "DE",
    population: 556227,
    geonameId: 2935022
  },
  "Santiago De Cuba": {
    coords: [-75.82171, 20.02287],
    country: "CU",
    population: 555865,
    geonameId: 3536729
  },
  "Siping": {
    coords: [124.37785, 43.16143],
    country: "CN",
    population: 555609,
    geonameId: 2034714
  },
  "Benguela": {
    coords: [13.40268, -12.57674],
    country: "AO",
    population: 555124,
    geonameId: 3351663
  },
  "Chuxiong": {
    coords: [101.54556, 25.03639],
    country: "CN",
    population: 555081,
    geonameId: 1814760
  },
  "Huaihua": {
    coords: [110.00404, 27.56337],
    country: "CN",
    population: 552622,
    geonameId: 1807689
  },
  "Chiclayo": {
    coords: [-79.85495, -6.77008],
    country: "PE",
    population: 552508,
    geonameId: 3698350
  }
};

/**
 * 通过城市名称获取坐标
 * @param cityName 城市名称（已标准化）
 * @returns 坐标 [lng, lat] 或 undefined
 */
export function getCityCoords(cityName: string): [number, number] | undefined {
  const city = CITY_COORDS[cityName];
  return city?.coords;
}
