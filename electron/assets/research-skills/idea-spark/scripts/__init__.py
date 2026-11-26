"""Bundled IdeaSpark scripts package.

The navigator imports sibling modules as ``scripts.next_step``. Keeping this
file makes that a regular package rooted at the installed skill, so it wins
over an unrelated ``scripts`` package that may appear later on ``sys.path``
when the navigator runs from a foreign working directory.
"""
