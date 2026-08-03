# Portable Windows mode

The optional archive is:

`Gielinor-Companion-Portable-1.2.0-x64.zip`

Extract the whole ZIP and run `Launch Gielinor Companion Portable.cmd`. The
launcher passes `--portable`; running the EXE without that argument uses the
standard installed-mode data location.

The archive contains the desktop EXE, exact compatible MCP sidecar, `runtime/`,
portable launcher, and `README-PORTABLE.txt`. Explicit portable mode stores its
database only below the extracted application directory:

```text
portable-data\gielinor.db
```

It never silently opens or modifies the installed per-user database. Likewise,
installed mode never adopts portable data. Deleting `portable-data` permanently
deletes portable profiles, confirmed quest state, holdings, cash, watchlists,
acquisition costs, journal entries, and paper trades; export or back it up first.

Portable mode remains a native-real runtime. It does not use preview fixtures,
control RuneScape, or place Grand Exchange offers. Public refreshes still need
network access unless a validated retained snapshot is available.
