The context engine must construct the ancestry path vector A=[R,…,P] by walking up from target path P to root R. It must collect:

- `MOTIVE` across all nodes in the ancestry path vector from P to R.
- `RULE` across all nodes in the ancestry path vector from P to R.
- `GIST` strictly at target path P (directory and file-level gists), omitting ancestor gists to prevent implementation context noise.
