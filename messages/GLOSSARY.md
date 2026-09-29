# Translation glossary (English → Amharic)

The words the Amharic interface uses, so the same thing is called the same everywhere. Where
Ethiopian businesses commonly use the English word (or an Amharic transliteration of it), that is
what the interface uses too: the goal is what a storekeeper or cashier in Addis Ababa actually
says, not a coined term nobody recognises.

## Conventions

- Message files: `messages/{en,am}/<area>.json`. Keys are `<area>_<snake_case>`, e.g.
  `stock_post_confirm`. Placeholders are `{name}` and must be the same in both languages.
- Use a message from `common` (`common_save`, `common_cancel`…) rather than repeating one.
- Keep codes and units as they are: SKU, TIN, VAT, TOT, FS No., IRN, GRN, ETB, kg, pcs, document
  numbers (`BOL-GRN-2019-00042`), and Ethiopian dates (already in Amharic month names).
- Money stays "ETB 1,250.00" in both languages; numbers stay in Western digits.
- Polite, plain register, the way a form or a bank's app speaks: እባክዎ… for requests, short labels
  without a verb for buttons where English has one word ("Save" → "አስቀምጥ").
- Item, customer and supplier names are data, never translated. Items and categories have an
  Amharic name (`name_am`) that is shown in the Amharic interface where there is one.

## Terms

| English                               | Amharic                               |
| ------------------------------------- | ------------------------------------- |
| Dashboard                             | ዳሽቦርድ                                 |
| Stock / inventory                     | ክምችት                                  |
| Stock on hand                         | ያለ ክምችት                               |
| Item                                  | ዕቃ                                    |
| Items                                 | ዕቃዎች                                  |
| Category                              | ምድብ                                   |
| Unit (of measure)                     | መለኪያ                                  |
| Base unit                             | መሠረታዊ መለኪያ                            |
| Pack (box, carton…)                   | ጥቅል                                   |
| Barcode                               | ባርኮድ                                  |
| SKU                                   | SKU (የዕቃ ኮድ)                          |
| Lot / batch                           | ሎት                                    |
| Expiry date                           | የሚያበቃበት ቀን                            |
| Expired                               | ጊዜው ያለፈበት                             |
| Expiring soon                         | በቅርቡ የሚያበቃ                            |
| Serial number                         | ሲሪያል ቁጥር                              |
| Quarantine                            | ተለይቶ የተቀመጠ (ኳራንቲን)                    |
| Recall                                | ከገበያ ማስመለስ                            |
| Branch                                | ቅርንጫፍ                                 |
| Location                              | ቦታ                                    |
| Warehouse / store room                | መጋዘን                                  |
| Shop floor                            | መሸጫ                                   |
| Document                              | ሰነድ                                   |
| Draft                                 | ረቂቅ                                   |
| Post (a document)                     | መዝግብ (ማጽደቅ) — button: "መዝግብ"          |
| Posted                                | የተመዘገበ                                |
| Cancelled                             | የተሰረዘ                                 |
| Goods receipt (GRN)                   | የዕቃ ገቢ (GRN)                          |
| Receive                               | ተረከብ / መረከብ                           |
| Issue (stock out)                     | ወጪ                                    |
| Transfer                              | ዝውውር                                  |
| In transit                            | በጉዞ ላይ                                |
| Adjustment                            | ማስተካከያ                                |
| Write-off                             | ከሂሳብ መሰረዝ                             |
| Stock count                           | የክምችት ቆጠራ                             |
| Variance / difference                 | ልዩነት                                  |
| Requisition                           | የዕቃ ጥያቄ                               |
| Department                            | ክፍል                                   |
| Approval                              | ማጽደቅ                                  |
| Approve / reject                      | አጽድቅ / ውድቅ አድርግ                       |
| Waiting for approval                  | ማጽደቅ በመጠባበቅ ላይ                        |
| Reservation / held stock              | የተያዘ ክምችት                             |
| Reorder                               | እንደገና ማዘዝ                             |
| Reorder level / min / max             | የማዘዣ ደረጃ / ዝቅተኛ / ከፍተኛ                |
| Lead time                             | የማድረሻ ጊዜ                              |
| Purchase order                        | የግዢ ትዕዛዝ                              |
| Supplier                              | አቅራቢ                                  |
| Customer                              | ደንበኛ                                  |
| Walk-in customer                      | ያልተመዘገበ ደንበኛ                          |
| Sale                                  | ሽያጭ                                   |
| Till / POS                            | ካሽ መመዝገቢያ (POS)                       |
| Shift                                 | ፈረቃ                                   |
| Cashier                               | ገንዘብ ተቀባይ                             |
| Cart                                  | ጋሪ                                    |
| Hold (a cart)                         | አቆይ                                   |
| Change (money back)                   | መልስ                                   |
| Receipt (of a sale)                   | ደረሰኝ                                  |
| Invoice                               | ደረሰኝ (ኢንቮይስ)                          |
| Tax invoice                           | የግብር ደረሰኝ                             |
| Proforma                              | ፕሮፎርማ                                 |
| Price                                 | ዋጋ                                    |
| Price list                            | የዋጋ ዝርዝር                              |
| Discount                              | ቅናሽ                                   |
| Cost                                  | ወጪ ዋጋ                                 |
| Average cost                          | አማካይ ወጪ ዋጋ                            |
| Value                                 | ዋጋ (ግምት)                              |
| Total                                 | ድምር                                   |
| Subtotal                              | ንዑስ ድምር                               |
| Payment                               | ክፍያ                                   |
| Paid                                  | የተከፈለ                                 |
| Balance / owed                        | ቀሪ ሂሳብ / ዕዳ                           |
| Credit (sale on credit)               | ዱቤ                                    |
| Credit limit                          | የዱቤ ጣሪያ                               |
| Overdue                               | ጊዜው ያለፈ ዕዳ                            |
| Ageing                                | የዕዳ ዕድሜ                               |
| Statement                             | የሂሳብ መግለጫ                             |
| Return (customer)                     | የደንበኛ ተመላሽ                            |
| Return to supplier                    | ለአቅራቢ ተመላሽ                            |
| Transaction                           | ግብይት                                  |
| Money in / out                        | ገቢ / ወጪ                               |
| Payment method                        | የክፍያ ዘዴ                               |
| Reference (Telebirr ID, FT no.)       | ማጣቀሻ ቁጥር                              |
| Verified                              | የተረጋገጠ                                |
| Void                                  | ውድቅ የተደረገ                             |
| VAT                                   | ተ.እ.ታ (VAT)                           |
| TOT                                   | የተርን ኦቨር ታክስ (TOT)                    |
| Withholding tax                       | ተቀናሽ ግብር (ዊዝሆልዲንግ)                    |
| TIN                                   | የግብር ከፋይ መለያ ቁጥር (TIN)                |
| Fiscal receipt / device               | የፊስካል ደረሰኝ / ማሽን                      |
| E-invoice                             | ኤሌክትሮኒክ ደረሰኝ                          |
| Landed cost                           | የማስገቢያ ወጪ                             |
| Freight / duty / clearing             | ማጓጓዣ / ቀረጥ / የጉምሩክ አስተላላፊ             |
| Exchange rate                         | የምንዛሪ ተመን                             |
| Kit / recipe                          | ጥቅል ዕቃ / የአሰራር ቀመር                    |
| Variant                               | ዓይነት                                  |
| Service                               | አገልግሎት                                |
| Warranty                              | ዋስትና                                  |
| Report                                | ሪፖርት                                  |
| Export                                | ላክ (Export)                           |
| Print                                 | አትም                                   |
| Search                                | ፈልግ                                   |
| Filter                                | አጣራ                                   |
| Settings                              | ቅንብሮች                                 |
| Admin panel                           | የአስተዳደር ገጽ                            |
| Business profile                      | የድርጅት መረጃ                             |
| User                                  | ተጠቃሚ                                  |
| Role                                  | ሚና                                    |
| Permission                            | ፈቃድ                                   |
| Owner / manager / storekeeper / clerk | ባለቤት / ሥራ አስኪያጅ / ዕቃ ግምጃ ቤት ኃላፊ / ጸሐፊ |
| Sign in / sign out                    | ግባ / ውጣ                               |
| Password                              | የይለፍ ቃል                               |
| Save / cancel / delete / edit / add   | አስቀምጥ / ሰርዝ (ተው) / አጥፋ / አስተካክል / ጨምር |
| Close                                 | ዝጋ                                    |
| Yes / no                              | አዎ / አይ                               |
| Optional                              | አማራጭ                                  |
| Required                              | አስፈላጊ                                 |
| Note                                  | ማስታወሻ                                 |
| Date                                  | ቀን                                    |
| Quantity                              | ብዛት                                   |
| Status                                | ሁኔታ                                   |
| Name / phone / email / address        | ስም / ስልክ / ኢሜይል / አድራሻ                |
| Import                                | አስገባ (Import)                         |
| Label (sticker)                       | መለያ                                   |
| SMS                                   | አጭር የጽሑፍ መልዕክት (SMS)                  |

"Cancel" as in _don't do this_ is "ተው"; as in _cancel this draft_ it is "ሰርዝ". "Delete" (remove a
row) is "አጥፋ".
