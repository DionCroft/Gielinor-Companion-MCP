# Holdings and trade journal

Holdings and trades are private records you maintain. They are not downloaded
from Jagex and do not prove what is currently in your bank, inventory or active
GE offers.

## Holdings

Open **Grand Exchange → Portfolio**. Enter an exact item ID, quantity, optional
average acquisition price and optional confirmed cash. Saving creates a new
local snapshot for the selected profile.

CSV columns are `itemId,quantity,averageAcquisitionPrice,notes`. JSON may be a
complete export or an object containing `cashGp` and `items`. Import is a bulk
replacement and therefore requires explicit confirmation. Exported data appears
in the transfer field for you to copy to a file you control.

The account-aware quest shopping-list tool can subtract exact item IDs from the
latest confirmed snapshot. Unresolved names and alternatives remain on the
list with assumptions instead of being guessed.

## Trade journal

Open **Grand Exchange → Trade journal** and record a completed manual buy or
sell with item ID, quantity, unit price and time. These records drive realised
gain/loss calculations. Guide-value profit remains an estimate until a sell is
recorded.

## Watchlists and paper trading

Watchlists are private item-ID collections. Paper trades use simulated cash and
holdings, reject impossible sells or overspending, and never alter the confirmed
portfolio. Nothing in these screens places or changes a RuneScape offer.

The current optional Alt1 overlay provides read-only visible-chat quest
suggestions with mandatory confirmation. Bank and GE-history OCR import is not
implemented in Version 1.1; enter or import those records manually. Any future
OCR-derived record must be confirmed before saving, and visible pixels can
never provide a complete account snapshot.
