"""Compatibility import for the P4 Direct RSD transport adapter."""

from core.transport.direct_rsd_adapter import DirectRsdAdapter

DirectTransportAdapter = DirectRsdAdapter

__all__ = ["DirectRsdAdapter", "DirectTransportAdapter"]
