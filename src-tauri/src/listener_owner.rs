//! Point-in-time ownership check for the exact IPv4 loopback listener.

use windows_sys::Win32::Foundation::ERROR_INSUFFICIENT_BUFFER;
use windows_sys::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID, TCP_TABLE_OWNER_PID_LISTENER,
};
use windows_sys::Win32::Networking::WinSock::AF_INET;

pub(crate) fn loopback_listener_owner(port: u16) -> Result<Option<u32>, String> {
    let mut size = 0u32;
    let mut status = unsafe {
        GetExtendedTcpTable(
            std::ptr::null_mut(),
            &mut size,
            0,
            u32::from(AF_INET),
            TCP_TABLE_OWNER_PID_LISTENER,
            0,
        )
    };
    if status != ERROR_INSUFFICIENT_BUFFER {
        return Err(format!(
            "Could not inspect the local engine listener (Windows error {status})"
        ));
    }
    for _ in 0..4 {
        if size == 0 || size > 16 * 1024 * 1024 {
            return Err("Local engine listener table has an invalid size".into());
        }
        // IP Helper requires a writable buffer aligned for its row structures.
        let mut buffer = vec![0u32; (size as usize).div_ceil(4)];
        let mut returned = u32::try_from(buffer.len() * 4)
            .map_err(|_| "Local engine listener table is too large".to_owned())?;
        status = unsafe {
            GetExtendedTcpTable(
                buffer.as_mut_ptr().cast(),
                &mut returned,
                0,
                u32::from(AF_INET),
                TCP_TABLE_OWNER_PID_LISTENER,
                0,
            )
        };
        if status == ERROR_INSUFFICIENT_BUFFER {
            size = returned;
            continue;
        }
        if status != 0 {
            return Err(format!(
                "Could not inspect the local engine listener (Windows error {status})"
            ));
        }
        let header = std::mem::offset_of!(MIB_TCPTABLE_OWNER_PID, table);
        let count = usize::try_from(buffer[0])
            .map_err(|_| "Invalid local engine listener count".to_owned())?;
        let rows_size = count
            .checked_mul(std::mem::size_of::<MIB_TCPROW_OWNER_PID>())
            .and_then(|bytes| header.checked_add(bytes))
            .ok_or_else(|| "Invalid local engine listener table".to_owned())?;
        if rows_size > returned as usize {
            return Err("Local engine listener table was truncated".into());
        }
        let rows = unsafe {
            std::slice::from_raw_parts(
                buffer
                    .as_ptr()
                    .cast::<u8>()
                    .add(header)
                    .cast::<MIB_TCPROW_OWNER_PID>(),
                count,
            )
        };
        let mut owner = None;
        for row in rows {
            if row.dwLocalAddr == u32::from_ne_bytes([127, 0, 0, 1])
                && u16::from_be(row.dwLocalPort as u16) == port
            {
                if owner.is_some_and(|previous| previous != row.dwOwningPid) {
                    return Err("Multiple processes own the local engine listener".into());
                }
                owner = Some(row.dwOwningPid);
            }
        }
        return Ok(owner);
    }
    Err("Local engine listener table kept changing".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_loopback_listener_is_owned_by_this_process() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        assert_eq!(
            loopback_listener_owner(port).unwrap(),
            Some(std::process::id())
        );
    }
}
