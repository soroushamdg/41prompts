# 41prompts

An alias for [`fortyone-prompts`](../python). Installing it installs that; there is nothing else in
here.

```bash
pip install 41prompts     # or: pip install fortyone-prompts
```

```python
import fortyone

result = fortyone.resolve("pr_1a2b3c4d", {"customer_name": "Ada"})
```

**The import name is `fortyone` either way.** A distribution name and an import name are different
things in Python, and `41prompts` cannot be an import name at all — a module name may not start with
a digit. This package exists so that somebody who knows the product's name finds the right thing
when they type it.

**It ships no module of its own.** Two distributions installing the same `fortyone/` directory is
how a machine ends up with two copies and no rule about which one wins. This is a name and a
dependency.

Apache-2.0. `sdks/python/README.md` is the documentation, including the divergence table against
`@41prompts/sdk`.

**Neither name is on PyPI yet.** Registering them needs an account (EPIC-006) and publishing needs
the public repository (EPIC-056).
